import type { Color, NormalMove } from 'chessops';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';

import { povChances } from 'lib/ceval/winningChances';

// winning chances (-1 to 1, from the mover's point of view)
const WINNING_CHANCES = 0.75;

// a played move with the engine results it is judged by. scores are from white's point of view
export interface MoveEvals {
  fen: FEN; // the position before the move
  uci?: Uci; // the move played
  score?: EvalScore; // the score of `fen`
  best?: Uci; // the engine's best move in `fen`
  second?: EvalScore; // the score of the engine's second line in `fen`
}

export interface ImportantMove {
  pos: Chess;
  move: NormalMove;
  color: Color;
}

export function importantMove({ fen, uci, best, second }: MoveEvals): ImportantMove | undefined {
  if (!uci || best !== uci) return undefined;

  const parsed = parseFen(fen).chain(setup => Chess.fromSetup(setup));
  if (parsed.isErr) return undefined;
  const pos = parsed.value;

  const move = parseUci(uci);
  if (!move || !('from' in move)) return undefined;
  if (pos.isCheck() || move.promotion === 'queen') return undefined;

  const color = pos.turn;
  if (second && povChances(color, second) >= WINNING_CHANCES) return undefined;

  return { pos, move, color };
}
