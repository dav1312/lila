package lila.round

import chess.format.pgn.{ Parser, SanStr }
import chess.format.{ Fen, Uci }
import chess.variant.{ Bughouse, Variant }
import chess.{ Check, ErrorStr, Position, Ply, Square }
import play.api.libs.json.*

case class Step(
    ply: Ply,
    move: Option[Uci.WithSan],
    fen: Fen.Full,
    check: Check,
    // None when not computed yet
    dests: Option[Map[Square, List[Square]]],
    drops: Option[List[Square]],
    crazyData: Option[chess.variant.Crazyhouse.Data]
):
  // who's color plays next
  def color = ply.turn

  def toJson = Json.toJson(this)

object Step:

  given Writes[Step] = Writes: step =>
    import play.api.libs.json.*
    import lila.common.Json.given
    import step.*
    Json
      .obj(
        "ply" -> ply,
        "uci" -> move.map(_.uci.uci),
        "san" -> move.map(_.san),
        "fen" -> fen
      )
      .add("check", check)
      .add(
        "dests",
        dests.map {
          _.map { (orig, dests) =>
            s"${orig.asChar}${dests.map(_.asChar).mkString}"
          }.mkString(" ")
        }
      )
      .add(
        "drops",
        drops.map: drops =>
          JsString(drops.map(_.key).mkString)
      )
      .add("crazy", crazyData)

object StepBuilder:

  def apply(id: GameId, sans: Vector[SanStr], variant: Variant, initialFen: Fen.Full): JsArray =
    val setup = chess.Position.AndFullMoveNumber(variant, initialFen)

    val moveSteps = new Array[JsValue](sans.size + 1)

    moveSteps(0) = Step(
      ply = setup.ply,
      move = none,
      fen = Fen.write(setup),
      check = setup.position.check,
      dests = None,
      drops = None,
      crazyData = setup.position.crazyData
    ).toJson

    @annotation.tailrec
    def replay(position: Position, ply: Ply, index: Int): Option[ErrorStr] =
      if index > sans.size then none
      else
        playOrReceive(position, sans(index - 1), variant) match
          case Left(error) => error.some
          case Right(played) =>
            val nextPly = ply.next
            moveSteps(index) = Step(
              ply = nextPly,
              move = Uci.WithSan(played.move.toUci, played.move.toSanStr).some,
              fen = Fen.write(played.next, nextPly.fullMoveNumber),
              check = played.next.check,
              dests = None,
              drops = None,
              crazyData = played.next.crazyData
            ).toJson
            replay(played.next, nextPly, index + 1)

    replay(setup.position, setup.ply, 1).foreach(logChessError(id.value))

    // if a move cannot be played, the steps from there on are left out instead of being sent as nulls
    JsArray(moveSteps.toIndexedSeq.takeWhile(_ != null))

  // a bughouse drop can use a piece the partner board handed over, which the moves do not record,
  // so the piece is received first when the drop is not playable from the pocket alone
  private def playOrReceive(position: Position, san: SanStr, variant: Variant) =
    position.play(san) match
      case Left(error) =>
        Parser.san(san) match
          case Right(drop: chess.format.pgn.Drop) if variant.bughouse =>
            Bughouse.receive(position, position.color - drop.role).play(san)
          case _ => Left(error)
      case played => played

  private val logChessError = (id: String) =>
    (err: chess.ErrorStr) =>
      val path = if id == "synthetic" then "analysis" else id
      logger.info(s"round.StepBuilder https://lichess.org/$path ${err.value}")
