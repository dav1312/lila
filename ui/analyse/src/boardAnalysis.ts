// ui\analyse\src\boardAnalysis.ts
import { parseSquare, opposite, roleToChar, squareRank } from 'chessops/util';
import { SquareSet } from 'chessops/squareSet';
import { kingAttacks, knightAttacks, pawnAttacks, rookAttacks, bishopAttacks } from 'chessops/attacks';
import { Board as ChessopsBoard } from 'chessops/board';
import { Chess } from 'chessops/chess';
import { parseBoardFen, parseFen as parseFenLib } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { FILE_NAMES, RANK_NAMES } from 'chessops/types';
import type { Role, Color, Move } from 'chessops/types';
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

function toBoardFen(board: Board): string {
  let fen = '';
  let empty = 0;
  for (let r = 7; r >= 0; r--) {
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          fen += empty;
          empty = 0;
        }
        const char = roleToChar(p.role);
        fen += p.color === 'white' ? char.toUpperCase() : char;
      }
    }
    if (empty > 0) {
      fen += empty;
      empty = 0;
    }
    if (r > 0) fen += '/';
  }
  return fen;
}

function toChessopsBoard(board: Board): ChessopsBoard {
  const fen = toBoardFen(board);
  const res = parseBoardFen(fen);
  if ('error' in res) throw new Error(String(res.error));
  return res.value;
}

export function parseFen(placement: string): Board {
  const res = parseBoardFen(placement);
  if ('error' in res) return new Array(64).fill(null);
  return fromChessopsBoard(res.value);
}

function getBoardSets(
  board: Board,
  byColor: Color,
): {
  occupied: SquareSet;
  pawns: SquareSet;
  knights: SquareSet;
  kings: SquareSet;
  rooks: SquareSet;
  bishops: SquareSet;
  queens: SquareSet;
} {
  let occupied = SquareSet.empty();
  let pawns = SquareSet.empty();
  let knights = SquareSet.empty();
  let kings = SquareSet.empty();
  let rooks = SquareSet.empty();
  let bishops = SquareSet.empty();
  let queens = SquareSet.empty();

  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p) {
      occupied = occupied.with(i);
      if (p.color === byColor) {
        switch (p.role) {
          case 'pawn':
            pawns = pawns.with(i);
            break;
          case 'knight':
            knights = knights.with(i);
            break;
          case 'king':
            kings = kings.with(i);
            break;
          case 'rook':
            rooks = rooks.with(i);
            break;
          case 'bishop':
            bishops = bishops.with(i);
            break;
          case 'queen':
            queens = queens.with(i);
            break;
        }
      }
    }
  }

  return { occupied, pawns, knights, kings, rooks, bishops, queens };
}

function isSquareAttacked(
  board: Board,
  square: number,
  byColor: Color,
  cachedSets?: ReturnType<typeof getBoardSets>,
): boolean {
  const { occupied, pawns, knights, kings, rooks, bishops, queens } =
    cachedSets || getBoardSets(board, byColor);

  // 1. Knight
  if (knightAttacks(square).intersects(knights)) return true;

  // 2. Pawn (reverse lookup: where must a pawn be to attack 'square'?)
  if (pawnAttacks(opposite(byColor), square).intersects(pawns)) return true;

  // 3. King
  if (kingAttacks(square).intersects(kings)) return true;

  // 4. Sliders (Rook/Queen)
  if (rookAttacks(square, occupied).intersects(rooks.union(queens))) return true;

  // 5. Sliders (Bishop/Queen)
  if (bishopAttacks(square, occupied).intersects(bishops.union(queens))) return true;

  return false;
}

function getAttackers(
  board: Board,
  square: number,
  byColor: Color,
): { square: number; role: Role; color: Color }[] {
  const attackers: { square: number; role: Role; color: Color }[] = [];
  const { occupied, pawns, knights, kings, rooks, bishops, queens } = getBoardSets(board, byColor);

  const add = (set: SquareSet) => {
    for (const s of set) {
      const p = board[s];
      if (p) attackers.push({ ...p, square: s });
    }
  };

  // Knight
  add(knightAttacks(square).intersect(knights));

  // Pawn
  add(pawnAttacks(opposite(byColor), square).intersect(pawns));

  // King
  add(kingAttacks(square).intersect(kings));

  // Sliders
  add(rookAttacks(square, occupied).intersect(rooks.union(queens)));
  add(bishopAttacks(square, occupied).intersect(bishops.union(queens)));

  return attackers;
}

export function detectPins(board: Board): DrawShape[] {
  const shapes: DrawShape[] = [];
  const dirs: Partial<Record<Role, number[][]>> = {
    rook: ROOK_DIRS,
    bishop: BISHOP_DIRS,
    queen: QUEEN_DIRS,
  };

  const whiteSets = getBoardSets(board, 'white');
  const blackSets = getBoardSets(board, 'black');

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
                const isDef = isSquareAttacked(
                  board,
                  nr * 8 + nf,
                  target.color,
                  target.color === 'white' ? whiteSets : blackSets,
                );
                const valTarget = values[target.role];
                const valPinned = values[pinnedPiece.role];
                const valAttacker = values[p.role];

                // Logic: Pinned if Target > Pinned AND (Target is King (handled) OR Target Not Defended OR Target > Attacker)
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
  const tempBoard = [...board];
  const balances: number[] = [];
  let pieceOnSquare = target;
  let currentGain = 0;
  const attackerColor = opposite(target.color);
  let nextColor = attackerColor;

  while (true) {
    const attackers = getAttackers(tempBoard, square, nextColor);
    if (attackers.length === 0) break;

    // Sort by value to capture with cheapest piece first
    attackers.sort(comparePieces);

    const bestAttacker = attackers[0];

    // King safety check: King cannot capture into check
    if (bestAttacker.role === 'king') {
      if (isSquareAttacked(tempBoard, square, opposite(nextColor))) {
        break;
      }
    }

    const valCaptured = values[pieceOnSquare.role];
    if (nextColor === attackerColor) currentGain += valCaptured;
    else currentGain -= valCaptured;

    balances.push(currentGain);

    // Update board
    tempBoard[square] = bestAttacker;
    tempBoard[bestAttacker.square] = null;
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
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.role === 'king') continue;

    // Check Static Exchange Evaluation
    const see = getSEE(board, i, p);
    if (see > 0) {
      shapes.push({ orig: key(i), brush: 'undefended' });
    }
  }
  return shapes;
}

export function detectCheckable(board: Board, epSquare: number | null): DrawShape[] {
  const shapes: DrawShape[] = [];
  const cb = toChessopsBoard(board);

  const kings: { color: Color; square: number }[] = [];
  for (const color of ['white', 'black'] as const) {
    let kSq: number | undefined;
    for (const s of cb.king.intersect(cb[color])) {
      kSq = s;
      break;
    }
    if (typeof kSq === 'number') kings.push({ color, square: kSq });
  }

  for (const k of kings) {
    // Skip if already in check
    if (isSquareAttacked(board, k.square, opposite(k.color))) continue;

    const enemyColor = opposite(k.color);

    // Construct FEN to create Setup.
    // We assume no castling rights ('-') for the purpose of checking if opponent can deliver check.
    const boardFen = toBoardFen(board);
    const turnChar = enemyColor === 'white' ? 'w' : 'b';
    const epChar = epSquare !== null ? key(epSquare) : '-';
    const fullFen = `${boardFen} ${turnChar} - ${epChar} 0 1`;

    const setupRes = parseFenLib(fullFen);
    if ('error' in setupRes) continue;
    const setup = setupRes.value;

    const res = Chess.fromSetup(setup);

    // Check if position creation succeeded
    if ('error' in res) continue;
    const legalPos = res.value;

    const dests = chessgroundDests(legalPos);
    let checkFound = false;

    for (const [fromStr, tos] of dests) {
      if (checkFound) break;
      const from = parseSquare(fromStr);
      for (const toStr of tos) {
        const to = parseSquare(toStr);

        // Promotion check: if pawn moves to last rank
        const isPawn = cb.pawn.has(from);
        const rank = squareRank(to);
        const isPromo = isPawn && (rank === 0 || rank === 7);
        const candidates: (Role | undefined)[] = isPromo ? ['queen', 'knight'] : [undefined];

        for (const promotion of candidates) {
          const move: Move = { from, to, promotion };
          // Try to play the move and check if it results in check
          // Since play() is void/mutating, we clone
          const testPos = legalPos.clone();
          testPos.play(move);
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
