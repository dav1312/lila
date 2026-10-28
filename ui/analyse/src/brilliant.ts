import type { Color, Square } from 'chessops';
import { type Chess, normalizeMove } from 'chessops/chess';
import { opposite, parseUci } from 'chessops/util';

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

// material is counted in piece values; the size of a sacrifice is its exchange evaluation
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

// what is already known when measuring how much the mover wins back
interface WinBack {
  taker: Color;
  // the taker's pieces that were hanging before the move: the mover could take them anyway
  looseBefore: Set<Square>;
  // except the one the engine line takes right after the capture: then it pays for the sacrifice
  retaken?: Square;
  // how much of the capturer's loss the sacked piece's exchange evaluation already counts
  counted: number;
}

// the most the mover wins back from `taker` after its captures: the largest exchange gain on a hanging piece.
// `captures` are the squares the taker captured on, the sacked piece's first.
// the capturer that takes the sacked piece counts only for what it loses beyond its exchange evaluation,
// a piece attacked by the one that recaptures the sacked piece cannot be won as well, and pawns do not count
const offsetOf = (pos: Chess, captures: Square[], w: WinBack): number => {
  const hanging = hangingPieces(pos, w.taker, 0);
  const capturer = hanging.find(p => p.square === captures[0]);
  const recapturer = capturer?.principalAttacker;
  return hanging
    .filter(
      p =>
        !captures.includes(p.square) &&
        (!w.looseBefore.has(p.square) || p.square === w.retaken) &&
        p.principalAttacker !== recapturer &&
        pos.board.get(p.square)?.role !== 'pawn',
    )
    .reduce(
      (max, p) => Math.max(max, p.materialLoss),
      Math.max(0, (capturer?.materialLoss ?? 0) - w.counted),
    );
};

// the square of the taker's piece that the mover captures right after the taker's reply in the engine line
const retakenInLine = (pos: Chess, uci: Uci | undefined, pv: Uci[] | undefined): Square | undefined => {
  if (!pv || pv.length < 3 || pv[0] !== uci) return undefined;
  const line = pos.clone();
  for (const [i, uci] of pv.slice(0, 3).entries()) {
    const parsed = parseUci(uci);
    if (!parsed) return undefined;
    const move = normalizeMove(line, parsed);
    if (!line.isLegal(move) || !('from' in move)) return undefined;
    if (i === 2) return line.board.get(move.to)?.color === opposite(line.turn) ? move.to : undefined;
    line.play(move);
  }
  return undefined;
};

// or the mover wins it back after an even trade. the taker can decline the recapture,
// so the traded piece must be worth enough as well
const winsBackAfterTrade = (
  afterCapture: Chess,
  enough: number,
  offset: (pos: Chess, traded: Square) => number,
): boolean => {
  for (const [from, tos] of afterCapture.allDests()) {
    for (const to of tos) {
      const traded = valueAt(afterCapture, to);
      if (valueAt(afterCapture, from) !== traded || traded < enough) continue;
      const trade = play(afterCapture, from, to);
      const recaptures = capturersOf(trade, to);
      if (recaptures.length > 0 && recaptures.every(r => offset(play(trade, r, to), to) >= enough))
        return true;
    }
  }
  return false;
};

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

// whether every legal reply allows mate in one, so declining the sacrifice loses too
const everyReplyAllowsMate = (pos: Chess): boolean => {
  for (const [from, tos] of pos.allDests()) {
    for (const to of tos) if (!hasMateInOne(play(pos, from, to))) return false;
  }
  return true;
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
  const takerLooseBefore = new Set(hangingPieces(pos, taker, 0).map(p => p.square));
  const retaken = retakenInLine(pos, evals.uci, evals.pv);
  // computed only when a capture allows mate in one, and then once for all of them
  let unavoidable: boolean | undefined;
  const mateUnavoidable = () => (unavoidable ??= everyReplyAllowsMate(next));
  return candidates.some(sacked => {
    // a trapped piece left where it was is already lost, not sacrificed
    if (sacked.square !== move.to && wasTrapped(sacked.square)) return false;
    return capturersOf(next, sacked.square).some(from => {
      const afterCapture = play(next, from, sacked.square);
      // a mate in one only refutes a capture the taker could safely decline: otherwise the mate is the payoff
      if (hasMateInOne(afterCapture) && !mateUnavoidable()) return false;
      // what is sacrificed: the exchange loss, net of what the move captured and of what the mover wins back.
      // winning back `enough` leaves less than the minimum sacrifice
      const enough = sacked.materialLoss - captured - MIN_MATERIAL_LOSS + 1;
      const winBack: WinBack = {
        taker,
        looseBefore: takerLooseBefore,
        retaken,
        counted: valueAt(next, sacked.square) - sacked.materialLoss,
      };
      const offset = (pos: Chess, ...traded: Square[]) => offsetOf(pos, [sacked.square, ...traded], winBack);
      return offset(afterCapture) < enough && !winsBackAfterTrade(afterCapture, enough, offset);
    });
  });
}
