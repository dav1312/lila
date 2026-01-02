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

  const board = parseFen(nFen);
  shapes = shapes.concat(detectPins(board));
  shapes = shapes.concat(detectUndefended(board));
  shapes = shapes.concat(detectCheckable(board));

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

function parseFen(fen: string): Board {
  const board: Board = new Array(64).fill(null);
  const [placement] = fen.split(' ');
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

function isDefended(board: Board, index: number): boolean {
  const target = board[index];
  if (!target) return false;
  const color = target.color;
  const r = Math.floor(index / 8);
  const f = index % 8;

  const knightJumps = [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];
  const kingMoves = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const rookDirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const bishopDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  // 1. Knight defense
  for (const [dr, df] of knightJumps) {
    const nr = r + dr, nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const source = board[nr * 8 + nf];
      if (source && source.color === color && source.role === 'knight') return true;
    }
  }

  // 2. King defense
  for (const [dr, df] of kingMoves) {
    const nr = r + dr, nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const source = board[nr * 8 + nf];
      if (source && source.color === color && source.role === 'king') return true;
    }
  }

  // 3. Pawn defense
  const pawnDir = color === 'white' ? -1 : 1;
  const pr = r + pawnDir;
  if (pr >= 0 && pr < 8) {
    for (const pf of [f - 1, f + 1]) {
      if (pf >= 0 && pf < 8) {
        const source = board[pr * 8 + pf];
        if (source && source.color === color && source.role === 'pawn') return true;
      }
    }
  }

  // 4. Slider defense
  for (const [dr, df] of rookDirs) {
    for (let d = 1; d < 8; d++) {
      const nr = r + d * dr, nf = f + d * df;
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
      const source = board[nr * 8 + nf];
      if (source) {
        if (source.color === color && (source.role === 'rook' || source.role === 'queen')) return true;
        break;
      }
    }
  }

  for (const [dr, df] of bishopDirs) {
    for (let d = 1; d < 8; d++) {
      const nr = r + d * dr, nf = f + d * df;
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
      const source = board[nr * 8 + nf];
      if (source) {
        if (source.color === color && (source.role === 'bishop' || source.role === 'queen')) return true;
        break;
      }
    }
  }

  return false;
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
              // Found the piece behind the pin (target)
              if (values[target.role] > values[pinnedPiece.role]) {
                if (target.role === 'king') {
                  shapes.push({
                    orig: makeSquare(pinnedSq!),
                    brush: 'pin',
                  });
                } else {
                  // Refined logic for relative pins
                  const defended = isDefended(board, nr * 8 + nf);
                  // If undefended, the value diff (T > P) is sufficient.
                  // If defended, we must ensure winning T is worth losing A (T > A).
                  if (!defended || values[target.role] > values[p.role]) {
                    shapes.push({
                      orig: makeSquare(pinnedSq!),
                      brush: 'pin',
                    });
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
    if (!p) continue;
    if (p.role === 'king') continue;
    if (!isDefended(board, i)) {
      shapes.push({
        orig: makeSquare(i),
        brush: 'undefended',
      });
    }
  }
  return shapes;
}

function detectCheckable(board: Board): DrawShape[] {
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
    const kingPos = k.square;
    const enemyColor = opposite(k.color);
    let checkFound = false;

    // Iterate all enemy pieces
    for (let i = 0; i < 64; i++) {
      if (checkFound) break;
      const p = board[i];
      if (!p || p.color !== enemyColor) continue;

      const pr = Math.floor(i / 8);
      const pf = i % 8;
      const dests: number[] = [];

      if (p.role === 'knight') {
        for (const [dr, df] of knightJumps) {
          const nr = pr + dr, nf = pf + df;
          if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const target = board[nr * 8 + nf];
            if (!target || target.color !== p.color) dests.push(nr * 8 + nf);
          }
        }
      } else if (p.role === 'pawn') {
        const dir = p.color === 'white' ? 1 : -1; // White pawns move +1 rank in board array structure (0-7=Rank1)
        // Pushes
        let nr = pr + dir,
          nf = pf;
        if (nr >= 0 && nr < 8 && !board[nr * 8 + nf]) {
          dests.push(nr * 8 + nf);
          // Double push
          if ((p.color === 'white' && pr === 1) || (p.color === 'black' && pr === 6)) {
            const nnr = nr + dir;
            if (!board[nnr * 8 + nf]) dests.push(nnr * 8 + nf);
          }
        }
        // Captures
        for (const cdf of [-1, 1]) {
          nr = pr + dir;
          nf = pf + cdf;
          if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const target = board[nr * 8 + nf];
            if (target && target.color !== p.color) dests.push(nr * 8 + nf);
          }
        }
      } else if (['rook', 'bishop', 'queen', 'king'].includes(p.role)) {
        const dirs =
          p.role === 'rook'
            ? rookDirs
            : p.role === 'bishop'
              ? bishopDirs
              : p.role === 'queen'
                ? queenDirs
                : queenDirs; // King moves ~ queen dirs length 1
        const dist = p.role === 'king' ? 1 : 8;

        for (const [dr, df] of dirs) {
          for (let d = 1; d <= dist; d++) {
            const nr = pr + d * dr,
              nf = pf + d * df;
            if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
            const target = board[nr * 8 + nf];
            if (!target) dests.push(nr * 8 + nf);
            else {
              if (target.color !== p.color) dests.push(nr * 8 + nf);
              break;
            }
          }
        }
      }

      for (const d of dests) {
        // 1. Direct Check
        if (d !== i && isAttacking(p.role, d, kingPos, board, i)) {
          checkFound = true;
          break;
        }

        // 2. Discovered Check (if moving from 'i' unblocks a ray)
        if (d !== i && onLine(kingPos, i)) {
          const [dr, df] = getDirection(kingPos, i);
          if ((dr !== 0 || df !== 0) && !onRay(kingPos, d, dr, df)) {
            let r = Math.floor(i / 8) + dr,
              f = (i % 8) + df;
            while (r >= 0 && r < 8 && f >= 0 && f < 8) {
              if (r * 8 + f === d) break;
              const blocker = board[r * 8 + f];
              if (blocker) {
                if (
                  blocker.color === p.color &&
                  (blocker.role === 'queen' ||
                    (Math.abs(dr * df) === 1 && blocker.role === 'bishop') ||
                    (Math.abs(dr * df) === 0 && blocker.role === 'rook'))
                ) {
                  checkFound = true;
                }
                break;
              }
              r += dr;
              f += df;
            }
          }
        }
        if (checkFound) break;
      }
    }
    if (checkFound) {
      shapes.push({ orig: makeSquare(kingPos), brush: 'checkable' });
    }
  }
  return shapes;
}

function isAttacking(role: Role, from: number, to: number, board: Board, ignoredSq: number): boolean {
  const fr = Math.floor(from / 8),
    ff = from % 8;
  const tr = Math.floor(to / 8),
    tf = to % 8;
  const dr = tr - fr,
    df = tf - ff;
  const absDr = Math.abs(dr),
    absDf = Math.abs(df);

  if (role === 'knight') return (absDr === 1 && absDf === 2) || (absDr === 2 && absDf === 1);
  if (role === 'pawn') return absDr === 1 && absDf === 1; // Simplified: assume valid direction/capture
  if (role === 'king') return absDr <= 1 && absDf <= 1;

  const isDiag = absDr === absDf;
  const isOrth = dr === 0 || df === 0;

  if (role === 'rook' && !isOrth) return false;
  if (role === 'bishop' && !isDiag) return false;
  if (role === 'queen' && !isOrth && !isDiag) return false;

  const stepR = Math.sign(dr),
    stepF = Math.sign(df);
  let r = fr + stepR,
    f = ff + stepF;
  while (r !== tr || f !== tf) {
    const idx = r * 8 + f;
    if (idx !== ignoredSq && board[idx]) return false;
    r += stepR;
    f += stepF;
  }
  return true;
}

function getDirection(from: number, to: number): [number, number] {
  const fr = Math.floor(from / 8),
    ff = from % 8;
  const tr = Math.floor(to / 8),
    tf = to % 8;
  const dr = tr - fr,
    df = tf - ff;
  if (Math.abs(dr) === Math.abs(df)) return [Math.sign(dr), Math.sign(df)];
  if (dr === 0) return [0, Math.sign(df)];
  if (df === 0) return [Math.sign(dr), 0];
  return [0, 0];
}

function onLine(from: number, to: number): boolean {
  const [dr, df] = getDirection(from, to);
  return dr !== 0 || df !== 0;
}

function onRay(origin: number, target: number, dr: number, df: number): boolean {
  const fr = Math.floor(origin / 8),
    ff = origin % 8;
  const tr = Math.floor(target / 8),
    tf = target % 8;
  const dR = tr - fr,
    dF = tf - ff;
  if (Math.sign(dR) !== dr || Math.sign(dF) !== df) return false;
  if (dr === 0) return dR === 0;
  if (df === 0) return dF === 0;
  return Math.abs(dR) === Math.abs(dF);
}
