package lila.game

import chess.{ ErrorStr, Ply }
import chess.format.Fen
import monocle.syntax.all.*

import lila.core.game.BughouseReplay

object Rewind:

  def apply(game: CoreGame, initialFen: Option[Fen.Full]): Either[ErrorStr, Progress] =
    val rewoundPly = Ply(game.ply.value - 1)
    // a piece received after the undone move still stands, so it is received at the rewound ply
    val receipts = game.metadata.bughouseReceipts.map: receipt =>
      if receipt.ply.value > rewoundPly.value then receipt.copy(ply = rewoundPly) else receipt
    val start = chess.Game(game.variant, initialFen)
    val rewoundSans = game.sans.dropRight(1)
    val replay = BughouseReplay(start.position, start.ply, rewoundSans, receipts)
    replay.error
      .toLeft(replay.played.last)
      .map: rewound =>
        val color = game.turnColor
        val newClock = game.clock.map(_.takeback).map { clk =>
          clk.updatePlayer(color): clkPlayer =>
            clkPlayer.setRemaining(game.clockHistory.flatMap(_(color).lastOption) | clkPlayer.limit)
        }
        val newGame = game.copy(
          players = game.players.map(_.removeTakebackProposition),
          chess = start.copy(
            position = rewound.position,
            sans = rewoundSans,
            ply = rewound.ply,
            clock = newClock
          ),
          binaryMoveTimes = game.binaryMoveTimes.map { binary =>
            val moveTimes = BinaryFormat.moveTime.read(binary, game.playedPlies)
            BinaryFormat.moveTime.write(moveTimes.dropRight(1))
          },
          loadClockHistory = _ => game.clockHistory.map(_.update(!color, _.dropRight(1))),
          movedAt = nowInstant,
          metadata = game.metadata
            .copy(bughouseReceipts = receipts)
            .focus(_.drawOffers)
            .modify(_.beforePly(rewound.ply))
        )
        Progress(game, newGame)
