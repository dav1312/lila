// ui\analyse\src\boardAnalysis.ts
import { parseSquare, opposite, squareRank } from 'chessops/util';
import { SquareSet } from 'chessops/squareSet';
import { kingAttacks, knightAttacks, pawnAttacks, rookAttacks, bishopAttacks } from 'chessops/attacks';
import { Board as ChessopsBoard } from 'chessops/board';
import { Chess } from 'chessops/chess';
import { parseBoardFen } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { FILE_NAMES, RANK_NAMES } from 'chessops/types';
import type { Role, Color } from 'chessops/types';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';

export type Board = ({ role: Role; color: Color } | null)[];

interface PieceSets {
  pawns: SquareSet;
  knights: SquareSet;
  kings: SquareSet;
  rooks: SquareSet;
  bishops: SquareSet;
  queens: SquareSet;
  rookLike: SquareSet;
  bishopLike: SquareSet;
}

interface BoardStateSets {
  occupied: SquareSet;
  white: PieceSets;
  black: PieceSets;
}

const ROOK_DIRS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];
const BISHOP_DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const QUEEN_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];

const values: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };

const comparePieces = (a: { role: Role }, b: { role: Role }) => values[a.role] - values[b.role];

const key = (s: number): Key => (FILE_NAMES[s & 7] + RANK_NAMES[s >> 3]) as Key;

function fromChessopsBoard(cb: ChessopsBoard): Board {
  const board: Board = new Array(64).fill(null);
  for (const color of ['white', 'black'] as const) {
    const colorSet = cb[color];
    for (const role of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const) {
      const pieces = colorSet.intersect(cb[role]);
      for (const sq of pieces) {
        board[sq] = { role, color };
      }
    }
  }
  return board;
}

function toChessopsBoard(board: Board): ChessopsBoard {
  const cb = ChessopsBoard.empty();
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p) cb.set(i, p);
  }
  return cb;
}

export function parseFen(placement: string): Board {
  const res = parseBoardFen(placement);
  if ('error' in res) return new Array(64).fill(null);
  return fromChessopsBoard(res.value);
}

function getBoardSets(board: Board): BoardStateSets {
  const state: BoardStateSets = {
    occupied: SquareSet.empty(),
    white: {
      pawns: SquareSet.empty(),
      knights: SquareSet.empty(),
      kings: SquareSet.empty(),
      rooks: SquareSet.empty(),
      bishops: SquareSet.empty(),
      queens: SquareSet.empty(),
      rookLike: SquareSet.empty(),
      bishopLike: SquareSet.empty(),
    },
    black: {
      pawns: SquareSet.empty(),
      knights: SquareSet.empty(),
      kings: SquareSet.empty(),
      rooks: SquareSet.empty(),
      bishops: SquareSet.empty(),
      queens: SquareSet.empty(),
      rookLike: SquareSet.empty(),
      bishopLike: SquareSet.empty(),
    },
  };

  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p) {
      state.occupied = state.occupied.with(i);
      const s = p.color === 'white' ? state.white : state.black;
      switch (p.role) {
        case 'pawn':
          s.pawns = s.pawns.with(i);
          break;
        case 'knight':
          s.knights = s.knights.with(i);
          break;
        case 'king':
          s.kings = s.kings.with(i);
          break;
        case 'rook':
          s.rooks = s.rooks.with(i);
          s.rookLike = s.rookLike.with(i);
          break;
        case 'bishop':
          s.bishops = s.bishops.with(i);
          s.bishopLike = s.bishopLike.with(i);
          break;
        case 'queen':
          s.queens = s.queens.with(i);
          s.rookLike = s.rookLike.with(i);
          s.bishopLike = s.bishopLike.with(i);
          break;
      }
    }
  }

  return state;
}

function isSquareAttacked(square: number, byColor: Color, occupied: SquareSet, sets: PieceSets): boolean {
  if (knightAttacks(square).intersects(sets.knights)) return true;
  if (pawnAttacks(opposite(byColor), square).intersects(sets.pawns)) return true;
  if (kingAttacks(square).intersects(sets.kings)) return true;
  if (rookAttacks(square, occupied).intersects(sets.rookLike)) return true;
  if (bishopAttacks(square, occupied).intersects(sets.bishopLike)) return true;

  return false;
}

function getAttackers(
  board: Board,
  square: number,
  byColor: Color,
  occupied: SquareSet,
  sets: PieceSets,
): { square: number; role: Role; color: Color }[] {
  const attackers: { square: number; role: Role; color: Color }[] = [];

  const add = (set: SquareSet) => {
    for (const s of set) {
      const p = board[s];
      if (p) attackers.push({ ...p, square: s });
    }
  };

  add(knightAttacks(square).intersect(sets.knights));
  add(pawnAttacks(opposite(byColor), square).intersect(sets.pawns));
  add(kingAttacks(square).intersect(sets.kings));
  add(rookAttacks(square, occupied).intersect(sets.rookLike));
  add(bishopAttacks(square, occupied).intersect(sets.bishopLike));

  return attackers;
}

export function detectPins(board: Board): DrawShape[] {
  const shapes: DrawShape[] = [];
  const dirs: Partial<Record<Role, number[][]>> = {
    rook: ROOK_DIRS,
    bishop: BISHOP_DIRS,
    queen: QUEEN_DIRS,
  };

  const state = getBoardSets(board);

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (!p || !['rook', 'bishop', 'queen'].includes(p.role)) continue;

      const rayDirs = dirs[p.role]!;
      for (const [dr, df] of rayDirs) {
        let pinnedSq: number | null = null;
        let pinnedPiece: { role: Role; color: Color } | null = null;

        for (let i = 1; i < 8; i++) {
          const nr = r + i * dr;
          const nf = f + i * df;
          if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;

          const target = board[nr * 8 + nf];
          if (!target) continue;

          if (target.color === p.color) {
            break;
          } else {
            if (!pinnedPiece) {
              pinnedPiece = target;
              pinnedSq = nr * 8 + nf;
            } else {
              // Pinned logic check
              if (target.role === 'king') {
                shapes.push({ orig: key(pinnedSq!), brush: 'pin' });
              } else {
                // Check if target is defended
                const sets = target.color === 'white' ? state.white : state.black;
                const isDef = isSquareAttacked(nr * 8 + nf, target.color, state.occupied, sets);
                const valTarget = values[target.role];
                const valPinned = values[pinnedPiece.role];
                const valAttacker = values[p.role];

                if (valTarget > valPinned) {
                  if (!isDef || valTarget > valAttacker) {
                    shapes.push({ orig: key(pinnedSq!), brush: 'pin' });
                  }
                }
              }
              break;
            }
          }
        }
      }
    }
  }
  return shapes;
}

function getSEE(board: Board, square: number, target: { role: Role; color: Color }): number {
  const balances: number[] = [];
  let pieceOnSquare = target;
  let currentGain = 0;
  const attackerColor = opposite(target.color);
  let nextColor = attackerColor;

  const state = getBoardSets(board);

  while (true) {
    const sets = nextColor === 'white' ? state.white : state.black;
    const attackers = getAttackers(board, square, nextColor, state.occupied, sets);
    if (attackers.length === 0) break;

    // Sort by value to capture with cheapest piece first
    attackers.sort(comparePieces);

    const bestAttacker = attackers[0];

    // King safety check
    if (bestAttacker.role === 'king') {
      const oppSets = nextColor === 'white' ? state.black : state.white;
      if (isSquareAttacked(square, opposite(nextColor), state.occupied, oppSets)) {
        break;
      }
    }

    const valCaptured = values[pieceOnSquare.role];
    if (nextColor === attackerColor) currentGain += valCaptured;
    else currentGain -= valCaptured;

    balances.push(currentGain);

    state.occupied = state.occupied.without(bestAttacker.square);
    const s = bestAttacker.color === 'white' ? state.white : state.black;
    s.pawns = s.pawns.without(bestAttacker.square);
    s.knights = s.knights.without(bestAttacker.square);
    s.kings = s.kings.without(bestAttacker.square);
    s.rooks = s.rooks.without(bestAttacker.square);
    s.bishops = s.bishops.without(bestAttacker.square);
    s.queens = s.queens.without(bestAttacker.square);
    s.rookLike = s.rookLike.without(bestAttacker.square);
    s.bishopLike = s.bishopLike.without(bestAttacker.square);

    pieceOnSquare = bestAttacker;
    nextColor = opposite(nextColor);
  }

  if (balances.length === 0) return 0;

  // Minimax
  let currentVal = balances[balances.length - 1];
  for (let i = balances.length - 2; i >= 0; i--) {
    // i % 2 === 0 means Attacker just moved, next is Defender (minimize)
    if (i % 2 === 0) currentVal = Math.min(balances[i], currentVal);
    else currentVal = Math.max(balances[i], currentVal);
  }

  return currentVal;
}

export function detectUndefended(board: Board): DrawShape[] {
  const shapes: DrawShape[] = [];
  const state = getBoardSets(board);

  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.role === 'king') continue;

    // If not attacked, SEE is never > 0
    const oppColor = opposite(p.color);
    const oppSets = oppColor === 'white' ? state.white : state.black;
    if (!isSquareAttacked(i, oppColor, state.occupied, oppSets)) continue;

    const see = getSEE(board, i, p);
    if (see > 0) {
      shapes.push({ orig: key(i), brush: 'undefended' });
    }
  }
  return shapes;
}

export function detectCheckable(board: Board, epSquare: number | null): DrawShape[] {
  const shapes: DrawShape[] = [];

  const kings: { color: Color; square: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p?.role === 'king') kings.push({ color: p.color, square: i });
  }

  const state = getBoardSets(board);
  const cb = toChessopsBoard(board);

  for (const k of kings) {
    const oppColor = opposite(k.color);
    const oppSets = oppColor === 'white' ? state.white : state.black;
    // Skip if already in check
    if (isSquareAttacked(k.square, oppColor, state.occupied, oppSets)) continue;

    const res = Chess.fromSetup({
      board: cb,
      turn: oppColor,
      castlingRights: SquareSet.empty(),
      epSquare: epSquare ?? undefined,
      halfmoves: 0,
      fullmoves: 1,
      pockets: undefined,
      remainingChecks: undefined,
    });
    if ('error' in res) continue;
    const legalPos = res.value;

    const dests = chessgroundDests(legalPos);
    let checkFound = false;

    for (const [fromStr, tos] of dests) {
      if (checkFound) break;
      const from = parseSquare(fromStr);
      const piece = board[from];
      if (!piece) continue;

      for (const toStr of tos) {
        const to = parseSquare(toStr);
        const rank = squareRank(to);
        const isPromo = piece.role === 'pawn' && (rank === 0 || rank === 7);
        const candidates: (Role | undefined)[] = isPromo ? ['queen', 'knight'] : [undefined];

        for (const promotion of candidates) {
          const testPos = legalPos.clone();
          testPos.play({ from, to, promotion });
          if (testPos.isCheck()) {
            checkFound = true;
            break;
          }
        }
        if (checkFound) break;
      }
    }

    if (checkFound) {
      shapes.push({ orig: key(k.square), brush: 'checkable' });
    }
  }
  return shapes;
}
