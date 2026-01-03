// ui\analyse\src\boardAnalysis.ts
import { parseSquare, opposite, squareRank, makeSquare } from 'chessops/util';
import { SquareSet } from 'chessops/squareSet';
import { kingAttacks, knightAttacks, pawnAttacks, rookAttacks, bishopAttacks } from 'chessops/attacks';
import { Board as ChessopsBoard } from 'chessops/board';
import { Chess } from 'chessops/chess';
import { parseBoardFen, parseCastlingFen } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import type { Role, Color } from 'chessops/types';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';

export type Board = ({ role: Role; color: Color } | null)[];

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

function fromChessopsBoard(cb: ChessopsBoard): Board {
  const board: Board = new Array(64).fill(null);
  for (const [sq, piece] of cb) board[sq] = piece;
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
  return 'error' in res ? new Array(64).fill(null) : fromChessopsBoard(res.value);
}

function isSquareAttacked(square: number, byColor: Color, cb: ChessopsBoard): boolean {
  if (knightAttacks(square).intersects(cb[byColor].intersect(cb.knight))) return true;
  if (pawnAttacks(opposite(byColor), square).intersects(cb[byColor].intersect(cb.pawn))) return true;
  if (kingAttacks(square).intersects(cb[byColor].intersect(cb.king))) return true;
  if (rookAttacks(square, cb.occupied).intersects(cb[byColor].intersect(cb.rooksAndQueens()))) return true;
  if (bishopAttacks(square, cb.occupied).intersects(cb[byColor].intersect(cb.bishopsAndQueens())))
    return true;
  return false;
}

function getAttackers(
  board: Board,
  square: number,
  byColor: Color,
  cb: ChessopsBoard,
): { square: number; role: Role; color: Color }[] {
  const attackers: { square: number; role: Role; color: Color }[] = [];
  const colorSet = cb[byColor];

  const add = (set: SquareSet) => {
    for (const s of set) {
      const p = board[s];
      if (p) attackers.push({ ...p, square: s });
    }
  };

  add(knightAttacks(square).intersect(colorSet).intersect(cb.knight));
  add(pawnAttacks(opposite(byColor), square).intersect(colorSet).intersect(cb.pawn));
  add(kingAttacks(square).intersect(colorSet).intersect(cb.king));
  add(rookAttacks(square, cb.occupied).intersect(colorSet).intersect(cb.rooksAndQueens()));
  add(bishopAttacks(square, cb.occupied).intersect(colorSet).intersect(cb.bishopsAndQueens()));

  return attackers;
}

export function detectPins(board: Board): DrawShape[] {
  const shapes: DrawShape[] = [];
  const cb = toChessopsBoard(board);
  const dirs: Partial<Record<Role, number[][]>> = { rook: ROOK_DIRS, bishop: BISHOP_DIRS, queen: QUEEN_DIRS };

  // Find sliding attackers
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (!p || !dirs[p.role]) continue;

      // Project a ray in every direction the sliding piece can move
      for (const [dr, df] of dirs[p.role]!) {
        let pinnedSq: number | null = null;
        let pinnedPiece: { role: Role; color: Color } | null = null;

        for (let i = 1; i < 8; i++) {
          const nr = r + i * dr,
            nf = f + i * df,
            targetSq = nr * 8 + nf;
          if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
          const target = board[targetSq];

          if (!target) continue;

          // If we hit a piece of the same color as the attacker, the ray is blocked
          if (target.color === p.color) break;

          if (!pinnedPiece) {
            // First enemy piece encountered is the one that might be pinned
            pinnedPiece = target;
            pinnedSq = targetSq;
          } else {
            // Second enemy piece encountered is the piece being shielded
            if (target.role === 'king') {
              // Absolute pin
              shapes.push({ orig: makeSquare(pinnedSq!) as Key, brush: 'pin' });
            } else {
              // Relative pin
              const valTarget = values[target.role],
                valPinned = values[pinnedPiece.role],
                valAttacker = values[p.role];

              if (
                valTarget > valPinned && // Back piece is worth more than front piece
                (!isSquareAttacked(targetSq, target.color, cb) || valTarget > valAttacker) // Back piece is undefended OR worth more than the attacker
              ) {
                shapes.push({ orig: makeSquare(pinnedSq!) as Key, brush: 'pin' });
              }
            }
            // Once we hit a second piece the ray ends
            break;
          }
        }
      }
    }
  }
  return shapes;
}

function getSEE(board: Board, square: number, target: { role: Role; color: Color }): number {
  const cb = toChessopsBoard(board);
  const balances: number[] = [];
  let pieceOnSquare = target;
  let currentGain = 0;
  const attackerColor = opposite(target.color);
  let nextColor = attackerColor;

  while (true) {
    const attackers = getAttackers(board, square, nextColor, cb);
    if (attackers.length === 0) break;

    // Sort by value to capture with cheapest piece first
    attackers.sort(comparePieces);

    const bestAttacker = attackers[0];

    // King safety check
    if (bestAttacker.role === 'king' && isSquareAttacked(square, opposite(nextColor), cb)) break;

    currentGain += (nextColor === attackerColor ? 1 : -1) * values[pieceOnSquare.role];
    balances.push(currentGain);

    cb.take(bestAttacker.square);
    pieceOnSquare = bestAttacker;
    nextColor = opposite(nextColor);
  }

  if (balances.length === 0) return 0;

  // Minimax
  let currentVal = balances[balances.length - 1];
  for (let i = balances.length - 2; i >= 0; i--) {
    currentVal = i % 2 === 0 ? Math.min(balances[i], currentVal) : Math.max(balances[i], currentVal);
  }
  return currentVal;
}

export function detectUndefended(board: Board): DrawShape[] {
  const shapes: DrawShape[] = [];
  const cb = toChessopsBoard(board);

  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.role !== 'king' && isSquareAttacked(i, opposite(p.color), cb) && getSEE(board, i, p) > 0) {
      shapes.push({ orig: makeSquare(i) as Key, brush: 'undefended' });
    }
  }
  return shapes;
}

export function detectCheckable(board: Board, epSquare: number | null, castling: string): DrawShape[] {
  const shapes: DrawShape[] = [];
  const cb = toChessopsBoard(board);

  const castlingRes = parseCastlingFen(cb, castling);
  const castlingRights = 'error' in castlingRes ? SquareSet.empty() : castlingRes.value;

  for (const color of ['white', 'black'] as const) {
    const kSq = cb.kingOf(color);

    // Skip if King is already in check
    if (kSq === undefined || isSquareAttacked(kSq, opposite(color), cb)) continue;

    const res = Chess.fromSetup({
      board: cb,
      turn: opposite(color),
      castlingRights: castlingRights,
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
      const from = parseSquare(fromStr),
        piece = board[from];
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

    if (checkFound) shapes.push({ orig: makeSquare(kSq) as Key, brush: 'checkable' });
  }
  return shapes;
}
