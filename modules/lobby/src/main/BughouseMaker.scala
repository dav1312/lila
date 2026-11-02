package lila.lobby

import chess.variant.Bughouse
import scalalib.model.Days
import chess.{ ByColor, Clock, Color, Game as ChessGame, Rated, White }

import lila.core.game.{ Game, GameRepo, IdGenerator, NewPlayer, OnStart, Source, newGame }
import lila.core.id.GameId
import lila.core.user.{ GameUser, UserApi }

/** Starts a bughouse match: two linked boards played by two teams of two.
  *
  * The four players are given in seat order: seat 0 plays White on board 1, seat 1 plays Black on board 1,
  * seat 2 plays White on board 2 and seat 3 plays Black on board 2. Partners are seats 0 and 3, and seats 1
  * and 2, so each partner plays the opposite color on the other board, and a piece captured on one board is
  * handed to the partner on the other.
  */
final class BughouseMaker(
    gameRepo: GameRepo,
    idGenerator: IdGenerator,
    newPlayer: NewPlayer,
    userApi: UserApi,
    onStart: OnStart
)(using Executor):

  /** Starts the match for four queued seeks, in seat order. */
  def startSeeks(seats: List[Seek]): Fu[List[JoinSeek]] = seats match
    case List(s0, s1, s2, s3) =>
      for
        users <- seats.traverse(s => userApi.byIdWithPerf(s.user.id, s.perfType))
        (game1, game2) <- boards(users, None, s0.daysPerTurn, s0.rated)
      yield List(
        JoinSeek(s0.user.id, s0, game1, White),
        JoinSeek(s1.user.id, s1, game1, Color.Black),
        JoinSeek(s2.user.id, s2, game2, White),
        JoinSeek(s3.user.id, s3, game2, Color.Black)
      )
    case _ => fufail(s"a bughouse match needs four seats, got ${seats.size}")

  /** Starts the match for four queued hooks, in seat order. */
  def start(seats: List[Hook]): Fu[List[JoinHook]] = seats match
    case List(s0, s1, s2, s3) =>
      for
        users <- seats.traverse(h => h.userId.so(userApi.byIdWithPerf(_, h.perfType)))
        (game1, game2) <- boards(users, s0.clock.some, None, s0.rated)
      yield List(
        JoinHook(s0.sri, s0, game1, White),
        JoinHook(s1.sri, s1, game1, Color.Black),
        JoinHook(s2.sri, s2, game2, White),
        JoinHook(s3.sri, s3, game2, Color.Black)
      )
    case _ => fufail(s"a bughouse match needs four seats, got ${seats.size}")

  /** Creates and starts the two linked boards for four users in seat order. */
  def boards(
      users: List[GameUser],
      clock: Option[Clock.Config],
      days: Option[Days],
      rated: Rated
  ): Fu[(Game, Game)] = users match
    case List(w1, b1, w2, b2) =>
      for
        game1 <- idGenerator.withUniqueId(board(ByColor(w1, b1), clock, days, rated))
        game2 <- idGenerator.withUniqueId(board(ByColor(w2, b2), clock, days, rated))
        (linked1, linked2) = BughouseMaker.linked(game1, game2)
        _ <- gameRepo.insertDenormalized(linked1)
        _ <- gameRepo.insertDenormalized(linked2)
        _ <- onStart.exec(linked1.id)
        _ <- onStart.exec(linked2.id)
      yield (linked1, linked2)
    case _ => fufail(s"a bughouse match needs four players, got ${users.size}")

  private def board(
      players: ByColor[GameUser],
      clock: Option[Clock.Config],
      days: Option[Days],
      rated: Rated
  ) =
    newGame(
      chess = ChessGame(position = Bughouse.initialPosition, clock = clock.map(_.toClock)),
      players = players.mapWithColor(newPlayer.apply),
      rated = rated,
      source = Source.Lobby,
      pgnImport = None,
      daysPerTurn = days
    ).start

object BughouseMaker:

  def linked(game1: Game, game2: Game): (Game, Game) =
    (withPartner(game1, game2.id), withPartner(game2, game1.id))

  private def withPartner(game: Game, partner: GameId): Game =
    game.copy(metadata = game.metadata.copy(bughousePartnerId = partner.some))
