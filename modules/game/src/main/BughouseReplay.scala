package lila.game

import chess.format.pgn.{ Parser, SanStr }
import chess.variant.Bughouse
import chess.{ ErrorStr, MoveOrDrop, Ply, Position }

import lila.core.game.BughouseReceipt

/** Replays the moves of a bughouse board. The pieces the partner board handed over are not moves, so they are
  * put in the pocket from their receipts, at the ply they arrived at.
  */
object BughouseReplay:

  /** The position after `ply` plies, and the move that led to it (none at the start). */
  case class Played(ply: Ply, move: Option[MoveOrDrop], position: Position)

  /** The positions reached, and the error that stopped the replay, if any. */
  case class Result(played: Vector[Played], error: Option[ErrorStr])

  def apply(start: Position, startPly: Ply, sans: Seq[SanStr], receipts: List[BughouseReceipt]): Result =
    sans.foldLeft(Result(Vector(Played(startPly, None, received(start, startPly, receipts))), none)):
      (result, san) =>
        if result.error.isDefined then result
        else
          val previous = result.played.last
          playOrReceive(previous.position, san) match
            case Left(error) => result.copy(error = error.some)
            case Right(played) =>
              val ply = previous.ply.next
              val position = received(played.next, ply, receipts)
              result.copy(played = result.played :+ Played(ply, played.move.some, position))

  private def received(position: Position, ply: Ply, receipts: List[BughouseReceipt]): Position =
    receipts.foldLeft(position): (position, receipt) =>
      if receipt.ply == ply then Bughouse.receive(position, receipt.piece) else position

  // games played before receipts were stored have no record of a received piece: a drop that
  // needs one is then played as if the piece had just been received
  private def playOrReceive(position: Position, san: SanStr) =
    position.play(san) match
      case Left(error) =>
        Parser.san(san) match
          case Right(drop: chess.format.pgn.Drop) if position.variant.bughouse =>
            Bughouse.receive(position, position.color - drop.role).play(san)
          case _ => Left(error)
      case played => played
