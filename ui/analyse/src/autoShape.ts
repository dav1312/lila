// ui\analyse\src\autoShape.ts
import { parseUci, makeSquare } from 'chessops/util';
import { isDrop } from 'chessops/types';
import { winningChances } from 'lib/ceval';
import { opposite } from '@lichess-org/chessground/util';
import type { DrawModifiers, DrawShape } from '@lichess-org/chessground/draw';
import { annotationShapes } from 'lib/game/glyphs';
import type AnalyseCtrl from './ctrl';
import { isUci } from 'lib/game/chess';

const pieceDrop = (key: Key, role: Role, color: Color): DrawShape => ({
  orig: key,
  piece: {
    color,
    role,
    scale: 0.8,
  },
  brush: 'green',
});

export function makeShapesFromUci(
  color: Color,
  uci: Uci,
  brush: string,
  modifiers?: DrawModifiers,
): DrawShape[] {
  if (uci === 'Current Position') return [];
  const move = parseUci(uci)!;
  const to = makeSquare(move.to);
  if (isDrop(move)) return [{ orig: to, brush }, pieceDrop(to, move.role, color)];

  const shapes: DrawShape[] = [{ orig: makeSquare(move.from), dest: to, brush, modifiers }];
  if (move.promotion) shapes.push(pieceDrop(to, move.promotion, color));
  return shapes;
}

export function compute(ctrl: AnalyseCtrl): DrawShape[] {
  const color = ctrl.node.fen.includes(' w ') ? 'white' : 'black';
  const rcolor = opposite(color);
  if (ctrl.practice) {
    const hovering = ctrl.practice.hovering();
    if (hovering) return makeShapesFromUci(color, hovering.uci, 'green');
    const hint = ctrl.practice.hinting();
    if (hint) {
      if (hint.mode === 'move') return makeShapesFromUci(color, hint.uci, 'paleBlue');
      else
        return [
          {
            orig: (hint.uci[1] === '@' ? hint.uci.slice(2, 4) : hint.uci.slice(0, 2)) as Key,
            brush: 'paleBlue',
          },
        ];
    }
    return [];
  }
  const {
    eval: nEval = {} as Partial<Tree.ServerEval>,
    fen: nFen,
    ceval: nCeval,
    threat: nThreat,
  } = ctrl.node;

  let hovering = ctrl.explorer.hovering();

  if (!hovering || hovering.fen !== nFen) {
    ctrl.explorer.hovering(null);
    hovering = ctrl.ceval.hovering();
  }

  let shapes: DrawShape[] = [],
    badNode;
  if (ctrl.retro && (badNode = ctrl.retro.showBadNode())) {
    return makeShapesFromUci(color, badNode.uci!, 'paleRed', {
      lineWidth: 8,
    });
  }
  if (hovering?.fen === nFen) shapes = shapes.concat(makeShapesFromUci(color, hovering.uci, 'paleBlue'));
  ctrl.fork.hover(hovering?.uci);

  if (ctrl.showBestMoveArrows() && ctrl.showAnalysis()) {
    if (isUci(nEval.best)) shapes = shapes.concat(makeShapesFromUci(rcolor, nEval.best, 'paleGreen'));
    if (!hovering && ctrl.ceval.search.multiPv) {
      const nextBest = ctrl.isCevalAllowed() && nCeval ? nCeval.pvs[0]?.moves[0] : ctrl.nextNodeBest();
      if (nextBest) shapes = shapes.concat(makeShapesFromUci(color, nextBest, 'paleBlue'));
      if (
        ctrl.isCevalAllowed() &&
        nCeval &&
        nCeval.pvs[1] &&
        !(ctrl.threatMode() && nThreat && nThreat.pvs.length > 2)
      ) {
        nCeval.pvs.forEach(function (pv) {
          if (pv.moves[0] === nextBest) return;
          const shift = winningChances.povDiff(color, nCeval.pvs[0], pv);
          if (shift >= 0 && shift < 0.2) {
            shapes = shapes.concat(
              makeShapesFromUci(color, pv.moves[0], 'paleGrey', {
                lineWidth: Math.round(12 - shift * 50), // 12 to 2
              }),
            );
          }
        });
      }
    }
  }
  if (ctrl.isCevalAllowed() && ctrl.threatMode() && nThreat) {
    const [pv0, ...pv1s] = nThreat.pvs;

    shapes = shapes.concat(makeShapesFromUci(rcolor, pv0.moves[0], pv1s.length > 0 ? 'paleRed' : 'red'));

    pv1s.forEach(function (pv) {
      const shift = winningChances.povDiff(rcolor, pv, pv0);
      if (shift >= 0 && shift < 0.2) {
        shapes = shapes.concat(
          makeShapesFromUci(rcolor, pv.moves[0], 'paleRed', {
            lineWidth: Math.round(11 - shift * 45), // 11 to 2
          }),
        );
      }
    });
  }
  if (ctrl.showMoveAnnotationsOnBoard()) shapes = shapes.concat(annotationShapes(ctrl.node));
  if (ctrl.showVariationArrows()) hiliteVariations(ctrl, shapes);

  // Register brushes
  ctrl.chessground.state.drawable.brushes['pin'] = {
    key: 'pin',
    color: 'black',
    opacity: 1,
    lineWidth: 4,
  };
  ctrl.chessground.state.drawable.brushes['undefended'] = {
    key: 'undefended',
    color: 'red',
    opacity: 1,
    lineWidth: 4,
  };
  ctrl.chessground.state.drawable.brushes['checkable'] = {
    key: 'checkable',
    color: 'blue',
    opacity: 1,
    lineWidth: 4,
  };

  const parts = nFen.split(' ');
  const board = parseFen(parts[0]);
  const epSquare = parts[3] && parts[3] !== '-' ? squareIndex(parts[3]) : null;

  shapes = shapes.concat(detectPins(board));
  shapes = shapes.concat(detectUndefended(board));
  shapes = shapes.concat(detectCheckable(board, epSquare));

  return shapes;
}

function hiliteVariations(ctrl: AnalyseCtrl, autoShapes: DrawShape[]) {
  const visible = ctrl.visibleChildren();
  if (visible.length < 2) return;
  ctrl.chessground.state.drawable.brushes['variation'] = {
    key: 'variation',
    color: 'white',
    opacity: ctrl.variationArrowOpacity() || 0,
    lineWidth: 12,
  };
  const chap = ctrl.study?.data.chapter;
  const isGamebookEditor = chap?.gamebook && !ctrl.study?.gamebookPlay;
  for (const [i, node] of visible.entries()) {
    const existing = autoShapes.find(s => s.orig + s.dest === node.uci);
    if (existing) existing.modifiers = { hilite: i === ctrl.fork.selectedIndex ? 'white' : undefined };
    else
      autoShapes.push({
        orig: node.uci!.slice(0, 2) as Key,
        dest: node.uci?.slice(2, 4) as Key,
        brush: !isGamebookEditor ? 'variation' : i === 0 ? 'paleGreen' : 'paleRed',
        modifiers: { hilite: i === ctrl.fork.selectedIndex ? '#3291ff' : '#aaa' },
        below: true,
      });
  }
}

type Board = ({ role: Role; color: Color } | null)[];

const charToRole: Record<string, Role> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const values: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };

function squareIndex(key: string): number {
  return key.charCodeAt(0) - 97 + (key.charCodeAt(1) - 49) * 8;
}

function parseFen(placement: string): Board {
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
      const role = charToRole[char.toLowerCase()];
      board[rank * 8 + file] = { role, color };
      file++;
    }
  }
  return board;
}

function isSquareAttacked(board: Board, square: number, byColor: Color): boolean {
  const knightJumps = [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];
  const rookDirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const bishopDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const kingMoves = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  const r = Math.floor(square / 8);
  const f = square % 8;

  // 1. Knight
  for (const [dr, df] of knightJumps) {
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
  for (const [dr, df] of kingMoves) {
    const nr = r + dr,
      nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p && p.color === byColor && p.role === 'king') return true;
    }
  }

  // 4. Sliders (Rook/Queen)
  for (const [dr, df] of rookDirs) {
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
  for (const [dr, df] of bishopDirs) {
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

function getAttackers(board: Board, square: number, byColor: Color): { role: Role; color: Color }[] {
  const attackers: { role: Role; color: Color }[] = [];
  const r = Math.floor(square / 8);
  const f = square % 8;

  const knightJumps = [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];
  const rookDirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const bishopDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const kingMoves = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // Knight
  for (const [dr, df] of knightJumps) {
    const nr = r + dr,
      nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p && p.color === byColor && p.role === 'knight') attackers.push(p);
    }
  }

  // Pawn
  const pawnDir = byColor === 'white' ? -1 : 1;
  const pr = r + pawnDir;
  if (pr >= 0 && pr < 8) {
    for (const pf of [f - 1, f + 1]) {
      if (pf >= 0 && pf < 8) {
        const p = board[pr * 8 + pf];
        if (p && p.color === byColor && p.role === 'pawn') attackers.push(p);
      }
    }
  }

  // King
  for (const [dr, df] of kingMoves) {
    const nr = r + dr,
      nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p && p.color === byColor && p.role === 'king') attackers.push(p);
    }
  }

  // Sliders
  for (const [dr, df] of rookDirs) {
    for (let d = 1; d < 8; d++) {
      const nr = r + d * dr,
        nf = f + d * df;
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
      const p = board[nr * 8 + nf];
      if (p) {
        if (p.color === byColor && (p.role === 'rook' || p.role === 'queen')) attackers.push(p);
        break;
      }
    }
  }
  for (const [dr, df] of bishopDirs) {
    for (let d = 1; d < 8; d++) {
      const nr = r + d * dr,
        nf = f + d * df;
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
      const p = board[nr * 8 + nf];
      if (p) {
        if (p.color === byColor && (p.role === 'bishop' || p.role === 'queen')) attackers.push(p);
        break;
      }
    }
  }

  return attackers;
}

function detectPins(board: Board): DrawShape[] {
  const shapes: DrawShape[] = [];
  const dirs: Partial<Record<Role, number[][]>> = {
    rook: [[0, 1], [0, -1], [1, 0], [-1, 0]],
    bishop: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    queen: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
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

function detectUndefended(board: Board): DrawShape[] {
  const shapes: DrawShape[] = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.role === 'king') continue;

    const enemy = opposite(p.color);
    // Must be attacked to be relevant
    if (!isSquareAttacked(board, i, enemy)) continue;

    // Check if defended by own color
    if (!isSquareAttacked(board, i, p.color)) {
      shapes.push({ orig: makeSquare(i), brush: 'undefended' });
    } else {
      // Defended, check values: if attacker < target, it's still vulnerable
      const attackers = getAttackers(board, i, enemy);
      const minVal = Math.min(...attackers.map(a => values[a.role]));
      if (minVal < values[p.role]) {
        shapes.push({ orig: makeSquare(i), brush: 'undefended' });
      }
    }
  }
  return shapes;
}

function detectCheckable(board: Board, epSquare: number | null): DrawShape[] {
  const shapes: DrawShape[] = [];
  const kings: { color: Color; square: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.role === 'king') kings.push({ color: p.color, square: i });
  }

  const knightJumps = [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];
  const rookDirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const bishopDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const queenDirs = [...rookDirs, ...bishopDirs];

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
        for (const [dr, df] of knightJumps) {
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
        const dirs = p.role === 'rook' ? rookDirs : p.role === 'bishop' ? bishopDirs : queenDirs;
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

      // Simulate moves and check
      for (const m of dests) {
        // Optimization: Fast check rejection?
        // We perform the move on a temp board and see if King is attacked.
        // We also check legality: Own king must not be attacked.

        // Simulating the board is cheap for 64 elements
        const tempBoard = [...board];

        // Remove from origin
        tempBoard[i] = null;

        // Place at dest
        if (m.promo) {
          // Check if Queen promotion gives check
          tempBoard[m.to] = { role: 'queen', color: p.color };
        } else if (m.ep) {
          tempBoard[m.to] = { role: 'pawn', color: p.color };
          // Remove captured pawn
          const capSq = m.to + (p.color === 'white' ? -8 : 8);
          tempBoard[capSq] = null;
        } else {
          tempBoard[m.to] = p;
        }

        // 1. Is move legal? (Own king not in check)
        const ownKingSq = p.role === 'king' ? m.to : kings.find(x => x.color === p.color)?.square ?? -1;
        if (ownKingSq !== -1 && isSquareAttacked(tempBoard, ownKingSq, opposite(p.color))) {
          continue; // Move is illegal
        }

        // 2. Does it check the opponent king?
        if (isSquareAttacked(tempBoard, k.square, p.color)) {
          checkFound = true;
          break;
        }

        // If promo, also check Knight promo
        if (m.promo) {
          const tempBoardK = [...board];
          tempBoardK[i] = null;
          tempBoardK[m.to] = { role: 'knight', color: p.color };
          // Legality check again
          if (ownKingSq !== -1 && isSquareAttacked(tempBoardK, ownKingSq, opposite(p.color))) continue;
          if (isSquareAttacked(tempBoardK, k.square, p.color)) {
            checkFound = true;
            break;
          }
        }
      }
    }
    if (checkFound) {
      shapes.push({ orig: makeSquare(k.square), brush: 'checkable' });
    }
  }
  return shapes;
}
