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

  ctrl.chessground.state.drawable.brushes['pin'] = {
    key: 'pin',
    color: 'black',
    opacity: 1,
    lineWidth: 4,
  };
  shapes = shapes.concat(detectPins(nFen));

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

function detectPins(fen: string): DrawShape[] {
  const shapes: DrawShape[] = [];
  const board: ({ role: Role; color: Color } | null)[] = new Array(64).fill(null);
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
      const role = char.toLowerCase() as Role;
      board[rank * 8 + file] = { role, color };
      file++;
    }
  }

  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const dirs = {
    r: [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ],
    b: [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ],
    q: [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ],
  };

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (!p || !['r', 'b', 'q'].includes(p.role)) continue;

      const rayDirs = dirs[p.role as 'r' | 'b' | 'q'];
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
