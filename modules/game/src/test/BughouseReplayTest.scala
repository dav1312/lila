package lila.game

import chess.format.pgn.SanStr
import chess.variant.Bughouse
import chess.{ Piece, Ply }

import lila.core.game.BughouseReceipt

class BughouseReplayTest extends munit.FunSuite:

  private val start = Bughouse.initialPosition

  private def sans(moves: String*): Vector[SanStr] = moves.toVector.map(SanStr.apply)

  private def whiteKnights(position: chess.Position): Int =
    position.crazyData.fold(0)(_.pockets.white.knight)

  test("receipts round trip through their encoding"):
    val receipts = List(
      BughouseReceipt(Ply(2), Piece.WhiteKnight),
      BughouseReceipt(Ply(7), Piece.WhiteBishop)
    )
    assertEquals(BughouseReceipt.encodeAll(receipts), "2N 7B")
    assertEquals(BughouseReceipt.decodeAll(BughouseReceipt.encodeAll(receipts)), receipts)
    assertEquals(BughouseReceipt.decodeAll(""), Nil)

  test("a received piece is in the pocket from its ply, so a drop of it can be replayed"):
    val receipts = List(BughouseReceipt(Ply(2), Piece.WhiteKnight))
    val replay = BughouseReplay(start, Ply.initial, sans("e4", "e5", "N@f3"), receipts)
    assertEquals(replay.error, None)
    assertEquals(replay.played.size, 4)
    assertEquals(whiteKnights(replay.played(2).position), 1)
    assertEquals(whiteKnights(replay.played(3).position), 0)

  test("a piece received after the last move stays in the pocket"):
    val receipts = List(BughouseReceipt(Ply(2), Piece.WhiteKnight))
    val replay = BughouseReplay(start, Ply.initial, sans("e4", "e5"), receipts)
    assertEquals(replay.error, None)
    assertEquals(whiteKnights(replay.played.last.position), 1)
