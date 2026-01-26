import { parseUci, makeSquare } from 'chessops/util';
import { isDrop } from 'chessops/types';
import { winningChances } from 'lib/ceval';
import { opposite } from '@lichess-org/chessground/util';
import type { DrawModifiers, DrawShape } from '@lichess-org/chessground/draw';
import { annotationShapes, analysisGlyphs } from 'lib/game/glyphs';
import type AnalyseCtrl from './ctrl';
import { isUci } from 'lib/game/chess';
import { parseFen } from 'chessops/fen';
import type { ServerEval } from 'lib/tree/types';

const pieceDrop = (key: Key, role: Role, color: Color): DrawShape => ({
  orig: key,
  piece: {
    color,
    role,
    scale: 0.8,
  },
  brush: 'green',
});

const MAX_MANEUVER_ARROWS = 3;

function interferingArrow(from: string, to: string, occupied: Set<number>): boolean {
  // Convert "a1" to 0, "h8" to 63
  const getIndex = (s: string) => s.charCodeAt(0) - 97 + (s.charCodeAt(1) - 49) * 8;

  const fromIdx = getIndex(from);
  const toIdx = getIndex(to);

  if (fromIdx === toIdx) return true; // Ignore null moves

  // Mark the origin square as occupied
  occupied.add(fromIdx);

  const fromX = fromIdx % 8,
    fromY = Math.floor(fromIdx / 8);
  const toX = toIdx % 8,
    toY = Math.floor(toIdx / 8);

  const deltaX = Math.abs(toX - fromX);
  const deltaY = Math.abs(toY - fromY);

  // Knight move: only check the destination
  if ((deltaX === 2 && deltaY === 1) || (deltaX === 1 && deltaY === 2)) {
    if (occupied.has(toIdx)) return true;
    occupied.add(toIdx);
    return false;
  }

  // Sliding piece: check every square along the path
  const stepX = Math.sign(toX - fromX);
  const stepY = Math.sign(toY - fromY);

  let curX = fromX;
  let curY = fromY;

  while (curX !== toX || curY !== toY) {
    curX += stepX;
    curY += stepY;
    const curIdx = curX + curY * 8;

    if (occupied.has(curIdx)) return true;
    occupied.add(curIdx);
  }

  return false;
}

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
  const { eval: nEval = {} as Partial<ServerEval>, fen: nFen, ceval: nCeval, threat: nThreat } = ctrl.node;

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
      const bestPvMoves = ctrl.isCevalAllowed() && nCeval ? nCeval.pvs[0]?.moves : undefined;
      const nextBest = bestPvMoves?.[0] || ctrl.nextNodeBest();

      if (nextBest) {
        if (bestPvMoves?.length && ctrl.showManeuverMoveArrowsProp()) {
          const maxPairs = Math.min(bestPvMoves.length, MAX_MANEUVER_ARROWS * 2);
          const occupied = new Set<number>();
          for (let i = 0; i < maxPairs; i += 2) {
            const uci = bestPvMoves[i];
            const orig = uci.slice(0, 2);
            const dest = uci.slice(2, 4);
            if (i > 0) {
              const prevUci = bestPvMoves[i - 2];
              const prevDest = prevUci.slice(2, 4);

              if (prevDest !== orig) break;
            }
            if (interferingArrow(orig, dest, occupied)) break;
            shapes = shapes.concat(makeShapesFromUci(color, uci, 'paleBlue'));
          }
        } else shapes = shapes.concat(makeShapesFromUci(color, nextBest, 'paleBlue'));
      }

      if (
        ctrl.isCevalAllowed() &&
        nCeval?.pvs[1] &&
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
      const shift = winningChances.povDiff(rcolor, pv0, pv);
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

  if (ctrl.isCevalAllowed()) {
    const parsed = parseFen(nFen);
    if ('error' in parsed) return shapes;
    const { board, epSquare, castlingRights } = parsed.value;

    const addAnalysis = (orig: Key, type: keyof typeof analysisGlyphs) => {
      const idx = shapes.filter(s => s.orig === orig && s.customSvg).length;
      shapes.push({
        orig,
        customSvg: { html: analysisGlyphs[type](idx) },
      });
    };

    if (ctrl.motifEnabled()) {
      ctrl.motif.detectPins(board).forEach(p => addAnalysis(makeSquare(p.pinned) as Key, 'pin'));
      ctrl.motif
        .detectUndefended(board, epSquare)
        .forEach(u => addAnalysis(makeSquare(u.square) as Key, 'undefended'));
      ctrl.motif
        .detectCheckable(board, epSquare, castlingRights)
        .forEach(s => addAnalysis(makeSquare(s.king) as Key, 'checkable'));
    }
  }

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
