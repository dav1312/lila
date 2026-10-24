import type { Color, NormalMove } from 'chessops';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';

import { povChances } from 'lib/ceval/winningChances';
import type { TreeNode } from 'lib/tree/types';

// winning chances (-1 to 1, from the mover's point of view)
const WINNING_CHANCES = 0.75;

export interface ImportantMove {
  pos: Chess;
  move: NormalMove;
  color: Color;
}

export function importantMove(parent: TreeNode, node: TreeNode): ImportantMove | undefined {
  const prevEval = parent.ceval;
  if (!prevEval || !node.uci || prevEval.bestmove !== node.uci) return undefined;

  const parsed = parseFen(parent.fen).chain(setup => Chess.fromSetup(setup));
  if (parsed.isErr) return undefined;
  const pos = parsed.value;

  const move = parseUci(node.uci);
  if (!move || !('from' in move)) return undefined;
  if (pos.isCheck() || move.promotion === 'queen') return undefined;

  const color = pos.turn;
  const secondEval = prevEval.pvs[1];
  if (secondEval && povChances(color, secondEval) >= WINNING_CHANCES) return undefined;

  return { pos, move, color };
}
