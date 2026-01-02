// ui\analyse\src\boardAnalysis.ts
import { makeSquare, charToRole, opposite } from 'chessops/util';
import { SquareSet } from 'chessops/squareSet';
import {
  kingAttacks,
  knightAttacks,
  pawnAttacks,
  rookAttacks,
  bishopAttacks,
  attacks,
} from 'chessops/attacks';
import type { Role, Color } from 'chessops/types';
import type { DrawShape } from '@lichess-org/chessground/draw';

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

export function parseFen(placement: string): Board {
  const board: Board = new Array(64).fill(null);
  let rank = 7,
    file = 0;

  for (const char of placement) {
    if (char === '/') {
      rank--;
      file = 0;
    } else if (/\d/.test(char)) {
      file += parseInt(char, 10);
    } else {
      const color: Color = char === char.toUpperCase() ? 'white' : 'black';
      const role = charToRole(char);
      if (role) {
        board[rank * 8 + file] = { role, color };
        file++;
      }
    }
  }
  return board;
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

function isSquareAttacked(board: Board, square: number, byColor: Color): boolean {
  const { occupied, pawns, knights, kings, rooks, bishops, queens } = getBoardSets(board, byColor);

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
                shapes.push({ orig: makeSquare(pinnedSq!), brush: 'pin' });
              } else {
                // Check if target is defended
                const isDef = isSquareAttacked(board, nr * 8 + nf, target.color);
                const valTarget = values[target.role];
                const valPinned = values[pinnedPiece.role];
                const valAttacker = values[p.role];

                // Logic: Pinned if Target > Pinned AND (Target is King (handled) OR Target Not Defended OR Target > Attacker)
                if (valTarget > valPinned) {
                  if (!isDef || valTarget > valAttacker) {
                    shapes.push({ orig: makeSquare(pinnedSq!), brush: 'pin' });
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
    // getSEE internally calls getAttackers; if 0 attackers, it returns 0, so no explicit check needed here.
    const see = getSEE(board, i, p);
    if (see > 0) {
      shapes.push({ orig: makeSquare(i), brush: 'undefended' });
    }
  }
  return shapes;
}

export function detectCheckable(board: Board, epSquare: number | null): DrawShape[] {
  const shapes: DrawShape[] = [];
  const kings: { color: Color; square: number }[] = [];
  let occupied = SquareSet.empty();

  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p) {
      occupied = occupied.with(i);
      if (p.role === 'king') kings.push({ color: p.color, square: i });
    }
  }

  const workingBoard = [...board];

  for (const k of kings) {
    // Skip if already in check
    if (isSquareAttacked(board, k.square, opposite(k.color))) continue;

    const enemyColor = opposite(k.color);
    let checkFound = false;

    // Iterate all enemy pieces
    for (let i = 0; i < 64; i++) {
      if (checkFound) break;
      const p = board[i];
      if (!p || p.color !== enemyColor) continue;

      const dests: { to: number; promo?: boolean; ep?: boolean }[] = [];

      // Generate pseudo-legal moves
      if (p.role === 'pawn') {
        const pr = Math.floor(i / 8);
        const pf = i % 8;
        const dir = p.color === 'white' ? 1 : -1;
        const promRank = p.color === 'white' ? 7 : 0;
        // Pushes
        let nr = pr + dir,
          nf = pf;
        if (nr >= 0 && nr < 8 && !board[nr * 8 + nf]) {
          const isProm = nr === promRank;
          dests.push({ to: nr * 8 + nf, promo: isProm });
          if ((p.color === 'white' && pr === 1) || (p.color === 'black' && pr === 6)) {
            const nnr = nr + dir;
            if (!board[nnr * 8 + nf]) dests.push({ to: nnr * 8 + nf });
          }
        }
        // Captures
        for (const cdf of [-1, 1]) {
          nr = pr + dir;
          nf = pf + cdf;
          if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const destSq = nr * 8 + nf;
            const target = board[destSq];
            if (target && target.color !== p.color) {
              dests.push({ to: destSq, promo: nr === promRank });
            } else if (destSq === epSquare) {
              dests.push({ to: destSq, ep: true });
            }
          }
        }
      } else {
        // Use chessops for all other pieces
        const destinations = attacks(p, i, occupied);
        for (const dest of destinations) {
          const target = board[dest];
          if (!target || target.color !== p.color) {
            dests.push({ to: dest });
          }
        }
      }

      const ownKingSq = p.role === 'king' ? -1 : (kings.find(x => x.color === p.color)?.square ?? -1);

      // Simulate moves and check
      for (const m of dests) {
        const fromSq = i;
        const toSq = m.to;
        const captured = workingBoard[toSq];

        // Apply Move
        workingBoard[fromSq] = null;
        let epCapturedSq = -1;
        let epCapturedPiece: { role: Role; color: Color } | null = null;

        if (m.promo) {
          workingBoard[toSq] = { role: 'queen', color: p.color };
        } else if (m.ep) {
          workingBoard[toSq] = { role: 'pawn', color: p.color };
          epCapturedSq = toSq + (p.color === 'white' ? -8 : 8);
          epCapturedPiece = workingBoard[epCapturedSq];
          workingBoard[epCapturedSq] = null;
        } else {
          workingBoard[toSq] = p;
        }

        const effectiveKingSq = p.role === 'king' ? toSq : ownKingSq;

        // 1. Is move legal? (Own king not in check)
        const isLegal =
          effectiveKingSq === -1 || !isSquareAttacked(workingBoard, effectiveKingSq, opposite(p.color));

        if (isLegal) {
          // 2. Does it check the opponent king?
          if (isSquareAttacked(workingBoard, k.square, p.color)) {
            checkFound = true;
          } else if (m.promo) {
            // If promo to Queen didn't check, try Knight
            workingBoard[toSq] = { role: 'knight', color: p.color };
            if (isSquareAttacked(workingBoard, k.square, p.color)) {
              checkFound = true;
            }
          }
        }

        // Revert Move
        workingBoard[fromSq] = p;
        workingBoard[toSq] = captured;
        if (m.ep) {
          workingBoard[epCapturedSq] = epCapturedPiece;
        }

        if (checkFound) break;
      }
    }
    if (checkFound) {
      shapes.push({ orig: makeSquare(k.square), brush: 'checkable' });
    }
  }
  return shapes;
}
