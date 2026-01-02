import { makeSquare, charToRole, opposite } from 'chessops/util';
import type { Role, Color } from 'chessops/types';
import type { DrawShape } from '@lichess-org/chessground/draw';

export type Board = ({ role: Role; color: Color } | null)[];

const KNIGHT_JUMPS = [
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
];
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
const KING_MOVES = QUEEN_DIRS;

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

function isSquareAttacked(board: Board, square: number, byColor: Color): boolean {
  const r = Math.floor(square / 8);
  const f = square % 8;

  // 1. Knight
  for (const [dr, df] of KNIGHT_JUMPS) {
    const nr = r + dr,
      nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p && p.color === byColor && p.role === 'knight') return true;
    }
  }

  // 2. Pawn
  const pawnDir = byColor === 'white' ? -1 : 1; // Looking for attacker: White pawn attacks from below (-1 rank relative to target)
  const pr = r + pawnDir;
  if (pr >= 0 && pr < 8) {
    for (const pf of [f - 1, f + 1]) {
      if (pf >= 0 && pf < 8) {
        const p = board[pr * 8 + pf];
        if (p && p.color === byColor && p.role === 'pawn') return true;
      }
    }
  }

  // 3. King
  for (const [dr, df] of KING_MOVES) {
    const nr = r + dr,
      nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p && p.color === byColor && p.role === 'king') return true;
    }
  }

  // 4. Sliders (Rook/Queen)
  for (const [dr, df] of ROOK_DIRS) {
    for (let d = 1; d < 8; d++) {
      const nr = r + d * dr,
        nf = f + d * df;
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
      const p = board[nr * 8 + nf];
      if (p) {
        if (p.color === byColor && (p.role === 'rook' || p.role === 'queen')) return true;
        break;
      }
    }
  }

  // 5. Sliders (Bishop/Queen)
  for (const [dr, df] of BISHOP_DIRS) {
    for (let d = 1; d < 8; d++) {
      const nr = r + d * dr,
        nf = f + d * df;
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
      const p = board[nr * 8 + nf];
      if (p) {
        if (p.color === byColor && (p.role === 'bishop' || p.role === 'queen')) return true;
        break;
      }
    }
  }

  return false;
}

function getAttackers(
  board: Board,
  square: number,
  byColor: Color,
): { square: number; role: Role; color: Color }[] {
  const attackers: { square: number; role: Role; color: Color }[] = [];
  const r = Math.floor(square / 8);
  const f = square % 8;

  // Knight
  for (const [dr, df] of KNIGHT_JUMPS) {
    const nr = r + dr,
      nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p && p.color === byColor && p.role === 'knight') attackers.push({ ...p, square: nr * 8 + nf });
    }
  }

  // Pawn
  const pawnDir = byColor === 'white' ? -1 : 1;
  const pr = r + pawnDir;
  if (pr >= 0 && pr < 8) {
    for (const pf of [f - 1, f + 1]) {
      if (pf >= 0 && pf < 8) {
        const p = board[pr * 8 + pf];
        if (p && p.color === byColor && p.role === 'pawn') attackers.push({ ...p, square: pr * 8 + pf });
      }
    }
  }

  // King
  for (const [dr, df] of KING_MOVES) {
    const nr = r + dr,
      nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p && p.color === byColor && p.role === 'king') attackers.push({ ...p, square: nr * 8 + nf });
    }
  }

  // Sliders
  for (const [dr, df] of ROOK_DIRS) {
    for (let d = 1; d < 8; d++) {
      const nr = r + d * dr,
        nf = f + d * df;
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
      const p = board[nr * 8 + nf];
      if (p) {
        if (p.color === byColor && (p.role === 'rook' || p.role === 'queen'))
          attackers.push({ ...p, square: nr * 8 + nf });
        break;
      }
    }
  }
  for (const [dr, df] of BISHOP_DIRS) {
    for (let d = 1; d < 8; d++) {
      const nr = r + d * dr,
        nf = f + d * df;
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
      const p = board[nr * 8 + nf];
      if (p) {
        if (p.color === byColor && (p.role === 'bishop' || p.role === 'queen'))
          attackers.push({ ...p, square: nr * 8 + nf });
        break;
      }
    }
  }

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
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.role === 'king') kings.push({ color: p.color, square: i });
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

      const pr = Math.floor(i / 8);
      const pf = i % 8;
      const dests: { to: number; promo?: boolean; ep?: boolean }[] = [];

      // Generate pseudo-legal moves
      if (p.role === 'knight') {
        for (const [dr, df] of KNIGHT_JUMPS) {
          const nr = pr + dr,
            nf = pf + df;
          if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const target = board[nr * 8 + nf];
            if (!target || target.color !== p.color) dests.push({ to: nr * 8 + nf });
          }
        }
      } else if (p.role === 'pawn') {
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
      } else if (['rook', 'bishop', 'queen', 'king'].includes(p.role)) {
        const dirs = p.role === 'rook' ? ROOK_DIRS : p.role === 'bishop' ? BISHOP_DIRS : QUEEN_DIRS;
        const dist = p.role === 'king' ? 1 : 8;
        for (const [dr, df] of dirs) {
          for (let d = 1; d <= dist; d++) {
            const nr = pr + d * dr,
              nf = pf + d * df;
            if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
            const destSq = nr * 8 + nf;
            const target = board[destSq];
            if (!target) dests.push({ to: destSq });
            else {
              if (target.color !== p.color) dests.push({ to: destSq });
              break;
            }
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
        const isLegal = effectiveKingSq === -1 || !isSquareAttacked(workingBoard, effectiveKingSq, opposite(p.color));

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
