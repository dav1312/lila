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

  const board = parseFen(nFen);
  shapes = shapes.concat(detectPins(board));
  shapes = shapes.concat(detectUndefended(board));

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

function detectPins(board: Board): DrawShape[] {
  const shapes: DrawShape[] = [];
  const values: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };
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
              if (values[target.role] > values[pinnedPiece.role]) {
                shapes.push({
                  orig: makeSquare(pinnedSq!),
                  brush: 'pin',
                });
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
  const rookDirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const bishopDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const knightJumps = [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];
  const kingMoves = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    if (p.role === 'king') continue;

    const r = Math.floor(i / 8);
    const f = i % 8;
    let defended = false;

    // 1. Knight defense
    for (const [dr, df] of knightJumps) {
      const nr = r + dr, nf = f + df;
      if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
        const source = board[nr * 8 + nf];
        if (source && source.color === p.color && source.role === 'knight') {
          defended = true;
          break;
        }
      }
    }
    if (defended) continue;

    // 2. King defense
    for (const [dr, df] of kingMoves) {
      const nr = r + dr, nf = f + df;
      if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
        const source = board[nr * 8 + nf];
        if (source && source.color === p.color && source.role === 'king') {
          defended = true;
          break;
        }
      }
    }
    if (defended) continue;

    // 3. Pawn defense
    const pawnDir = p.color === 'white' ? -1 : 1;
    const pr = r + pawnDir;
    if (pr >= 0 && pr < 8) {
      for (const pf of [f - 1, f + 1]) {
        if (pf >= 0 && pf < 8) {
          const source = board[pr * 8 + pf];
          if (source && source.color === p.color && source.role === 'pawn') {
            defended = true;
            break;
          }
        }
      }
    }
    if (defended) continue;

    // 4. Slider defense (Rook/Queen/Bishop)
    // Orthogonal
    for (const [dr, df] of rookDirs) {
      for (let d = 1; d < 8; d++) {
        const nr = r + d * dr, nf = f + d * df;
        if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
        const source = board[nr * 8 + nf];
        if (source) {
          if (source.color === p.color && (source.role === 'rook' || source.role === 'queen')) {
            defended = true;
          }
          break;
        }
      }
      if (defended) break;
    }
    if (defended) continue;

    // Diagonal
    for (const [dr, df] of bishopDirs) {
      for (let d = 1; d < 8; d++) {
        const nr = r + d * dr, nf = f + d * df;
        if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
        const source = board[nr * 8 + nf];
        if (source) {
          if (source.color === p.color && (source.role === 'bishop' || source.role === 'queen')) {
            defended = true;
          }
          break;
        }
      }
      if (defended) break;
    }
    if (defended) continue;

    shapes.push({
      orig: makeSquare(i),
      brush: 'undefended',
    });
  }
  return shapes;
}
