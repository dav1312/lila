import type { Color, Square } from 'chessops';
import type { Chess } from 'chessops/chess';
import { opposite } from 'chessops/util';

import { povChances } from 'lib/ceval/winningChances';

import { type MoveEvals, importantMove } from './importantMove';
import {
  MIN_MATERIAL_LOSS,
  detectTrapped,
  detectUndefended,
  hasMateInOne,
  play,
  values,
} from './motif/boardAnalysis';
import type { Undefended } from './motif/interfaces';

// winning chances (-1 to 1, from the mover's point of view)
const LOSING_CHANCES = -0.1;

// pieces of `color` that are attacked and not adequately defended
const hangingPieces = (pos: Chess, color: Color, minLoss = MIN_MATERIAL_LOSS): Undefended[] =>
  detectUndefended(pos.board, pos.epSquare).filter(
    p => pos.board.get(p.square)?.color === color && p.materialLoss >= minLoss,
  );

// material is counted in piece values; the exchange evaluation only decides whether a piece is hanging
const valueAt = (pos: Chess, square: Square): number => {
  const role = pos.board.get(square)?.role;
  return role ? values[role] : 0;
};

// total value of the given hanging pieces
const totalValue = (pos: Chess, pieces: Undefended[]): number =>
  pieces.reduce((sum, p) => sum + valueAt(pos, p.square), 0);

const materialOf = (pos: Chess, color: Color): number => {
  let sum = 0;
  for (const square of pos.board[color]) sum += valueAt(pos, square);
  return sum;
};

// value of the most valuable hanging piece of `color`: one recapture can win back at most one piece
const largestHanging = (pos: Chess, color: Color): number =>
  hangingPieces(pos, color, 0).reduce((max, p) => Math.max(max, valueAt(pos, p.square)), 0);

// the squares of the pieces that can capture on `square`
const capturersOf = (pos: Chess, square: Square): Square[] => {
  const from: Square[] = [];
  for (const [src, tos] of pos.allDests()) {
    if (tos.has(square)) from.push(src);
  }
  return from;
};

const isTrapped = (pos: Chess, square: Square, color: Color, looseBefore: Set<Square>): boolean => {
  for (const to of pos.dests(square)) {
    const escape = play(pos, square, to);
    const badEscape =
      hasMateInOne(escape) || hangingPieces(escape, color).some(p => !looseBefore.has(p.square));
    if (!badEscape) return false;
  }
  return true;
};

// the capture is compensated if the taker's side can win back a piece at least as valuable as the sacked one
const isCapturePunished = (afterCapture: Chess, sackedValue: number, taker: Color): boolean => {
  if (hasMateInOne(afterCapture)) return true;

  if (largestHanging(afterCapture, taker) >= sackedValue) return true;

  // or by winning it back after an even trade
  for (const [from, tos] of afterCapture.allDests()) {
    for (const to of tos) {
      if (valueAt(afterCapture, from) !== valueAt(afterCapture, to)) continue;
      const trade = play(afterCapture, from, to);
      const recaptures = capturersOf(trade, to);
      if (
        recaptures.length > 0 &&
        recaptures.every(r => largestHanging(play(trade, r, to), taker) >= sackedValue)
      )
        return true;
    }
  }
  return false;
};

// sacrifices are judged with standard chess rules
export const brilliantVariants: VariantKey[] = ['standard', 'chess960', 'fromPosition'];

export function isBrilliantMove(evals: MoveEvals): boolean {
  const important = importantMove(evals);
  if (!important || !evals.score) return false;
  const { pos, move, color } = important;

  if (move.promotion) return false;
  // the move is the engine's best, so the score of `fen` is the score after it
  if (povChances(color, evals.score) < LOSING_CHANCES) return false;

  const next = pos.clone();
  next.play(move);

  // counted from the material balance, so en passant and castling onto the own rook need no special case
  const captured = materialOf(pos, opposite(color)) - materialOf(next, opposite(color));

  // the mover's hanging material must not shrink
  const hangingBefore = hangingPieces(pos, color);
  const hangingAfter = hangingPieces(next, color);
  if (totalValue(next, hangingAfter) < totalValue(pos, hangingBefore)) return false;

  // a loss only counts net of what the move just captured: giving that back is an exchange, not a sacrifice
  const candidates = hangingAfter.filter(p => p.materialLoss >= MIN_MATERIAL_LOSS + captured);
  if (candidates.length === 0) return false;

  // a trapped piece is already lost: moving it is a desperado, leaving it is no sacrifice.
  // trapped means hanging with no safe move, or attackable by a safe move with no safe answer
  const looseSquares = new Set(hangingBefore.map(p => p.square));
  const motifTrapped = new Set(
    detectTrapped(pos.board, pos.castles.castlingRights, pos.epSquare).map(t => t.square),
  );
  const wasTrapped = (square: Square): boolean =>
    motifTrapped.has(square) || (looseSquares.has(square) && isTrapped(pos, square, color, looseSquares));
  if (wasTrapped(move.from)) return false;

  const taker = next.turn;
  return candidates.some(sacked => {
    // a trapped piece left where it was is already lost, not sacrificed
    if (sacked.square !== move.to && wasTrapped(sacked.square)) return false;
    const sackedValue = valueAt(next, sacked.square);
    return capturersOf(next, sacked.square).some(
      from => !isCapturePunished(play(next, from, sacked.square), sackedValue, taker),
    );
  });
}
