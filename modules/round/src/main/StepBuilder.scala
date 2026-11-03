package lila.round

import chess.format.pgn.SanStr
import chess.format.{ Fen, Uci }
import chess.variant.Variant
import chess.{ Check, Ply, Square }
import play.api.libs.json.*

import lila.core.game.BughouseReceipt
import lila.game.BughouseReplay

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

  def apply(
      id: GameId,
      sans: Vector[SanStr],
      variant: Variant,
      initialFen: Fen.Full,
      receipts: List[BughouseReceipt]
  ): JsArray =
    val setup = chess.Position.AndFullMoveNumber(variant, initialFen)
    val replay = BughouseReplay(setup.position, setup.ply, sans, receipts)

    val steps = replay.played.map: played =>
      Step(
        ply = played.ply,
        move = played.move.map(move => Uci.WithSan(move.toUci, move.toSanStr)),
        fen = Fen.write(played.position, played.ply.fullMoveNumber),
        check = played.position.check,
        dests = None,
        drops = None,
        crazyData = played.position.crazyData
      ).toJson

    replay.error.foreach(logChessError(id.value))

    // if a move cannot be played, the steps up to it are sent, and no more
    JsArray(steps)

  private val logChessError = (id: String) =>
    (err: chess.ErrorStr) =>
      val path = if id == "synthetic" then "analysis" else id
      logger.info(s"round.StepBuilder https://lichess.org/$path ${err.value}")
