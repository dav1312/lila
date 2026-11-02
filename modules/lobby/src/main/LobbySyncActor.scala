package lila.lobby

import scalalib.actor.SyncActor

import lila.common.Bus
import lila.core.pool.{ HookThieve, IsClockCompatible }
import lila.core.socket.{ Sri, Sris }
import lila.mon.extensions.*

final private class LobbySyncActor(
    seekApi: SeekApi,
    biter: Biter,
    bughouseMaker: BughouseMaker,
    gameApi: lila.core.game.GameApi,
    hasCurrentPlayban: lila.core.playban.HasCurrentPlayban,
    poolApi: lila.core.pool.PoolApi,
    onStart: lila.core.game.OnStart
)(using Executor, IsClockCompatible)
    extends SyncActor:

  import LobbySyncActor.*

  private val hookRepo = new HookRepo

  private var remoteDisconnectAllAt = nowInstant

  // bughouse seeks waiting for three more players, kept in memory until a match starts
  private var bughouseSeeks = List.empty[Seek]

  private var socket: SyncActor = new SyncActor:
    val process = { case msg =>
      println(s"stub trouper received: $msg")
    }

  val process: SyncActor.Receive =

    // solve circular reference
    case SetSocket(actor) => socket = actor

    // bughouse hooks are not bitten one by one: they wait until four seats are queued, then start a match
    case msg @ SetupBus.AddHook(hook) if hook.realVariant.bughouse =>
      if hook.isAuth then
        hookRepo.bySri(hook.sri).foreach(remove)
        hook.sid.so: sid =>
          hookRepo.bySid(sid).foreach(remove)
        hookRepo.save(hook)
        socket ! msg
        startBughouseIfFull(hook)

    case msg @ SetupBus.AddHook(hook) =>
      lila.mon.lobby.hook.create.increment()
      hookRepo.bySri(hook.sri).foreach(remove)
      hook.sid.so: sid =>
        hookRepo.bySid(sid).foreach(remove)
      (!hook.compatibleWithPools).so(findCompatible(hook)) match
        case Some(h) =>
          biteHook(h.id, hook.sri, hook.user)
          publishRemoveHook(hook)
        case None =>
          hookRepo.save(msg.hook)
          socket ! msg

    case msg @ SetupBus.AddSeek(seek) if seek.realVariant.bughouse =>
      seekApi.insert(seek)
      socket ! msg
      bughouseSeeks = bughouseSeeks :+ seek
      startBughouseSeeksIfFull(seek)

    case msg @ SetupBus.AddSeek(seek) =>
      lila.mon.lobby.seek.create.increment()
      findCompatible(seek).foreach:
        case Some(s) => this ! BiteSeek(s.id, seek.user)
        case None => this ! SaveSeek(msg)

    case SaveSeek(msg) =>
      seekApi.insert(msg.seek)
      socket ! msg

    case CancelHook(sri) =>
      hookRepo.bySri(sri).foreach(remove)

    case CancelSeek(seekId, user) =>
      seekApi.removeBy(seekId, user.id)
      socket ! RemoveSeek(seekId)

    case BiteHook(hookId, sri, user) =>
      NoPlayban(user):
        biteHook(hookId, sri, user)

    case BiteSeek(seekId, user) =>
      NoPlayban(user.some):
        gameApi.countNowPlaying(user.id).foreach { nbPlaying =>
          if lila.core.game.maxPlaying > nbPlaying then
            lila.mon.lobby.seek.join.increment()
            seekApi
              .find(seekId)
              .foreach:
                _.foreach: seek =>
                  biter(seek, user).foreach(this.!)
        }

    case msg @ JoinHook(_, hook, game, _) =>
      onStart.exec(game.id)
      socket ! msg
      remove(hook)

    case msg @ JoinSeek(_, seek, game, _) =>
      onStart.exec(game.id)
      seekApi.archive(seek, game.id)
      socket ! msg
      socket ! RemoveSeek(seek.id)

    case BughouseStarted(joins) =>
      joins.foreach(join => socket ! join)

    case BughouseFailed(seats) =>
      seats.foreach(hookRepo.save)

    case BughouseSeeksStarted(joins) =>
      joins.foreach: join =>
        seekApi.archive(join.seek, join.game.id)
        socket ! join
        socket ! RemoveSeek(join.seek.id)

    case BughouseSeeksFailed(seeks) =>
      bughouseSeeks = seeks ++ bughouseSeeks

    case LeaveAll => remoteDisconnectAllAt = nowInstant

    case Tick(promise) =>
      hookRepo.truncateIfNeeded()
      socket
        .ask[Sris](GetSrisP.apply)
        .chronometer
        .logIfSlow(100, logger): r =>
          s"GetSris size=${r.sris.size}"
        .mon(lila.mon.lobby.socket.getSris)
        .result
        .logFailure(logger, err => s"broom cannot get sris from socket: $err")
        .foreach(this ! WithPromise(_, promise))

    case WithPromise(Sris(sris), promise) =>
      poolApi.setOnlineSris(Sris(sris))
      val fewSecondsAgo = nowInstant.minusSeconds(5)
      if remoteDisconnectAllAt.isBefore(fewSecondsAgo)
      then
        this ! RemoveHooks:
          hookRepo
            .notInSris(sris)
            .filter: h =>
              !h.boardApi && h.createdAt.isBefore(fewSecondsAgo)
            .toSet ++ hookRepo.hooksToCleanup

      lila.mon.lobby.socket.member.update(sris.size)
      lila.mon.lobby.hook.size.record(hookRepo.size)
      lila.mon.actor.queueSize("lobby").update(queueSize)
      promise.success(())

    case RemoveHooks(hooks) => hooks.foreach(remove)

    case Resync => socket ! HookIds(hookRepo.ids)

    case HookSub(member, true) =>
      socket ! AllHooksFor(member, hookRepo.filter(biter.showHookTo(_, member)).toSeq)

    case HookThieve.HookBus.GetCandidates(clock, promise) =>
      promise.success(HookThieve.PoolHooks(hookRepo.poolCandidates(clock)))

    case HookThieve.HookBus.StolenHookIds(ids) =>
      hookRepo.byIds(ids.toSet).foreach(remove)

  private def NoPlayban(user: Option[LobbyUser])(f: => Unit): Unit =
    user
      .so(u => hasCurrentPlayban(u.id))
      .foreach:
        if _ then () else f

  private def biteHook(hookId: String, sri: Sri, user: Option[LobbyUser]) =
    hookRepo.byId(hookId).foreach { hook =>
      remove(hook)
      hookRepo.bySri(sri).foreach(remove)
      biter(hook, sri, user).foreach(this.!)
    }

  private def startBughouseSeeksIfFull(seek: Seek): Unit =
    val seats = bughouseSeeks
      .filter(s => s.daysPerTurn == seek.daysPerTurn && s.rated == seek.rated)
      .distinctBy(_.user.id)
      .take(4)
    if seats.sizeIs == 4 then
      bughouseSeeks = bughouseSeeks.filterNot(seats.contains)
      val started = bughouseMaker.startSeeks(seats)
      started.foreach(joins => this ! BughouseSeeksStarted(joins))
      started.failed.foreach(_ => this ! BughouseSeeksFailed(seats))

  private def startBughouseIfFull(hook: Hook): Unit =
    val seats = hookRepo
      .filter(h => h.realVariant.bughouse && h.clock == hook.clock && h.rated == hook.rated)
      .toList
      .sortBy(_.createdAt)
      .distinctBy(_.userId)
      .take(4)
    if seats.sizeIs == 4 then
      seats.foreach(remove)
      val started = bughouseMaker.start(seats)
      started.foreach(joins => this ! BughouseStarted(joins))
      started.failed.foreach(_ => this ! BughouseFailed(seats))

  private def findCompatible(hook: Hook): Option[Hook] =
    hookRepo.filter(_.compatibleWith(hook)).find { existing =>
      biter.canJoin(existing, hook.user) &&
      !(existing.user, hook.user).tupled
        .so: (u1, u2) =>
          recentlyAbortedUserIdPairs.exists(u1.id, u2.id)
    }

  def registerAbortedGame(g: Game) = recentlyAbortedUserIdPairs.register(g)

  private object recentlyAbortedUserIdPairs:
    private val cache = scalalib.cache.ExpireSetMemo[String](1.hour)
    private def makeKey(u1: UserId, u2: UserId) = String:
      if u1.value < u2.value then s"$u1/$u2" else s"$u2/$u1"

    def register(g: Game) =
      for
        w <- g.whitePlayer.userId
        b <- g.blackPlayer.userId
        if g.sourceIs(_.Lobby)
      do cache.put(makeKey(w, b))
    def exists(u1: UserId, u2: UserId) = cache.get(makeKey(u1, u2))

  private def findCompatible(seek: Seek): Fu[Option[Seek]] =
    seekApi
      .forUser(seek.user)
      .map:
        _.find(_.compatibleWith(seek))

  private def remove(hook: Hook) =
    if hookRepo.exists(hook) then
      hookRepo.remove(hook)
      socket ! RemoveHook(hook.id)
      publishRemoveHook(hook)

  private def publishRemoveHook(hook: Hook): Unit =
    Bus.publishDyn(RemoveHook(hook.id), s"hookRemove:${hook.id}")

private object LobbySyncActor:

  private case class BughouseStarted(joins: List[JoinHook])
  private case class BughouseFailed(seats: List[Hook])
  private case class BughouseSeeksStarted(joins: List[JoinSeek])
  private case class BughouseSeeksFailed(seeks: List[Seek])

  case class SetSocket(actor: SyncActor)

  private case class Tick(promise: Promise[Unit])

  private case class WithPromise[A](value: A, promise: Promise[Unit])

  def start(
      broomPeriod: FiniteDuration,
      resyncIdsPeriod: FiniteDuration
  )(makeActor: () => LobbySyncActor)(using ec: Executor, scheduler: Scheduler) =
    val actor = makeActor()
    Bus.subscribeActor[HookThieve.HookBus](actor)
    Bus.subscribeActor[SetupBus](actor)
    scheduler.scheduleWithFixedDelay(15.seconds, resyncIdsPeriod)(() => actor ! Resync)
    lila.common.LilaScheduler(
      "LobbySyncActor",
      _.Every(broomPeriod),
      _.AtMost(10.seconds),
      _.Delay(7.seconds)
    ):
      actor.ask[Unit](Tick.apply)
    actor
