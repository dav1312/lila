import type { Color, Move, NormalMove, Role, Square } from 'chessops';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci, squareRank } from 'chessops/util';

import { povChances } from 'lib/ceval/winningChances';
import type { TreeNode } from 'lib/tree/types';

import { detectUndefended } from './motif/boardAnalysis';
import type { Undefended } from './motif/interfaces';

// winning chances (-1 to 1, from the mover's point of view)
const WINNING_CHANCES = 0.75;
const LOSING_CHANCES = -0.25;

const MIN_MATERIAL_LOSS = 2;

const ROLE_VALUE: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };

const materialLoss = (pieces: Undefended[]): number => pieces.reduce((sum, p) => sum + p.materialLoss, 0);

// promotions are the only special case for a normal move in these checks
const makeMove = (pos: Chess, from: Square, to: Square): NormalMove => {
  const promotes = pos.board.get(from)?.role === 'pawn' && [0, 7].includes(squareRank(to));
  return promotes ? { from, to, promotion: 'queen' } : { from, to };
};

const hangingPieces = (pos: Chess, color: Color, minLoss = MIN_MATERIAL_LOSS): Undefended[] =>
  detectUndefended(pos.board, pos.epSquare).filter(
    p => pos.board.get(p.square)?.color === color && p.materialLoss >= minLoss,
  );

const capturesOn = (pos: Chess, square: Square): NormalMove[] => {
  const captures: NormalMove[] = [];
  for (const [from, tos] of pos.allDests()) {
    if (tos.has(square)) captures.push(makeMove(pos, from, square));
  }
  return captures;
};

const hasMateInOne = (pos: Chess): boolean => {
  for (const [from, tos] of pos.allDests()) {
    for (const to of tos) {
      const next = pos.clone();
      next.play(makeMove(pos, from, to));
      if (next.isCheckmate()) return true;
    }
  }
  return false;
};

const isTrapped = (pos: Chess, square: Square, color: Color, hangingBefore: Undefended[]): boolean => {
  const hangingSquares = new Set(hangingBefore.map(p => p.square));
  for (const to of pos.dests(square)) {
    const escape = pos.clone();
    escape.play(makeMove(pos, square, to));
    const badEscape =
      hasMateInOne(escape) || hangingPieces(escape, color).some(p => !hangingSquares.has(p.square));
    if (!badEscape) return false;
  }
  return true;
};

const isCapturePunished = (afterCapture: Chess, sacked: Undefended, taker: Color): boolean => {
  if (hasMateInOne(afterCapture)) return true;

  const minLoss = Math.max(MIN_MATERIAL_LOSS, sacked.materialLoss - 1);
  return hangingPieces(afterCapture, taker, minLoss).length > 0;
};

export function isBrilliantMove(parent: TreeNode, node: TreeNode): boolean {
  const prevEval = parent.ceval;
  const nextEval = node.ceval;
  if (!prevEval || !nextEval || !node.uci || prevEval.bestmove !== node.uci) return false;

  const setup = parseFen(parent.fen);
  if ('error' in setup) return false;
  const parsed = Chess.fromSetup(setup.value);
  if ('error' in parsed) return false;
  const pos = parsed.value;

  const move: Move | undefined = parseUci(node.uci);
  if (!move || !('from' in move)) return false;
  if (pos.isCheck() || move.promotion === 'queen') return false;

  const color = pos.turn;

  if (povChances(color, nextEval) < LOSING_CHANCES) return false;

  const secondEval = prevEval.pvs[1];
  if (secondEval && povChances(color, secondEval) >= WINNING_CHANCES) return false;

  const next = pos.clone();
  next.play(move);

  const hangingBefore = hangingPieces(pos, color);
  const hangingAfter = hangingPieces(next, color);
  if (hangingAfter.length === 0) return false;
  if (materialLoss(hangingAfter) < materialLoss(hangingBefore)) return false;

  const epCapture = pos.board.get(move.from)?.role === 'pawn' && move.to === pos.epSquare;
  const target = pos.board.get(move.to);
  const captured = target ? ROLE_VALUE[target.role] : epCapture ? ROLE_VALUE.pawn : 0;
  if (captured >= materialLoss(hangingAfter)) return false;

  // a piece that was trapped is a desperado, not a sacrifice
  if (hangingBefore.some(p => p.square === move.from) && isTrapped(pos, move.from, color, hangingBefore))
    return false;

  const taker = next.turn;
  return hangingAfter.some(sacked =>
    capturesOn(next, sacked.square).some(capture => {
      const afterCapture = next.clone();
      afterCapture.play(capture);
      return !isCapturePunished(afterCapture, sacked, taker);
    }),
  );
}
