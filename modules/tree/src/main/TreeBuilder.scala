package lila.tree

import chess.format.pgn.Comment
import chess.format.{ Fen, Uci }
import chess.{ Centis, Ply, Position }
import lila.core.game.BughouseReplay

object TreeBuilder:

  type LogChessError = String => Unit

  def apply(
      game: Game,
      analysis: Option[Analysis],
      initialFen: Fen.Full,
      withFlags: ExportOptions,
      logChessError: LogChessError
  ): Root =
    val withClocks: Option[Vector[Centis]] = withFlags.clocks.so(game.bothClockStates)
    val drawOfferPlies = game.drawOffers.normalizedPlies
    val setup = chess.Position.AndFullMoveNumber(game.variant, initialFen)
    val replay = BughouseReplay(setup.position, setup.ply, game.sans, game.metadata.bughouseReceipts)
    val start = replay.played.head
    val fen = Fen.write(start.position, setup.fullMoveNumber)
    val infos: Vector[Info] = analysis.so(_.infos.toVector)
    val advices: Map[Ply, Advice] = analysis.so(_.advices.mapBy(_.ply))

    val root = Root(
      ply = setup.ply,
      fen = fen,
      clock = withFlags.clocks.so:
        game.clock.map(c => Centis.ofSeconds(c.limitSeconds.value)).map(Clock(_))
      ,
      crazyData = start.position.crazyData,
      eval = analysis.flatMap(_.initialScore).map(evals.fromScore)
    )

    def makeBranch(move: chess.MoveOrDrop, position: Position, ply: Ply): Branch =
      val fen = Fen.write(position, ply.fullMoveNumber)
      val index = (ply - setup.ply - 1).value
      val info = infos.lift(index)
      val advice = advices.get(ply)

      val branch = Branch(
        ply = ply,
        move = Uci.WithSan(move.toUci, move.toSanStr),
        fen = fen,
        clock = withClocks.flatMap(_.lift(index)).map(Clock(_)),
        crazyData = position.crazyData,
        eval = info.map(_.eval),
        glyphs = Node.Glyphs.fromBase(
          chess.format.pgn.Glyphs.fromList(advice.map(_.judgment.glyph).toList),
          comp = true
        ),
        comments = Node.Comments(
          drawOfferPlies(ply)
            .option(makeLichessComment(Comment(s"${!ply.turn} offers draw")))
            .toList :::
            advice
              .map(_.makeComment(false))
              .toList
              .map(makeLichessComment(_, true))
        )
      )

      advices
        .get(ply + 1)
        .fold(branch): adv =>
          withAnalysisChild(
            game.id,
            branch,
            position,
            ply,
            logChessError
          )(adv.info)

    val result = replay.played.foldRight(none[Branch]): (played, acc) =>
      played.move.fold(acc): move =>
        val branch = makeBranch(move, played.position, played.ply)
        acc.fold(branch)(branch.prependChildUnchecked).some

    replay.error.foreach(err => logChessError(formatError(game.id, err)))
    result.fold(root)(root.prependChildUnchecked)

  private def makeLichessComment(c: Comment, comp: Boolean = false): Node.Comment =
    Node.Comment(Node.Comment.Id.make, c, Node.Comment.Author.Lichess, comp = comp)

  private def withAnalysisChild(
      id: GameId,
      root: Branch,
      position: Position,
      ply: Ply,
      logChessError: LogChessError
  )(info: Info): Branch =

    def makeBranch(m: chess.MoveOrDrop, ply: Ply): Branch =
      val fen = Fen.write(m.after, ply.fullMoveNumber)
      Branch(
        ply = ply,
        move = Uci.WithSan(m.toUci, m.toSanStr),
        fen = fen,
        crazyData = m.after.position.crazyData,
        eval = none
      )

    val (result, error) = position
      .foldRight(info.variation.take(20), ply)(
        none[Branch],
        (step, acc) =>
          inline def branch = makeBranch(step.move, step.ply)
          acc.fold(branch)(acc => branch.addChild(acc)).some
      )

    error.foreach(e => logChessError(formatError(id, e)))
    result.fold(root): branch =>
      root.addChild(branch.copy(children = branch.children.updateAllWith(_.setComp)).setComp)

  private def formatError(id: GameId, err: chess.ErrorStr) =
    s"TreeBuilder https://lichess.org/$id ${err.value.linesIterator.toList.headOption}"
