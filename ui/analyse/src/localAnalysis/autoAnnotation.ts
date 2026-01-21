import { winningChances } from 'lib/ceval';
import type { TreeNode } from 'lib/tree/types';
import type { Color } from 'chessops/types';

const BLUNDER = 0.3;
const MISTAKE = 0.2;
const INACCURACY = 0.1;

const plyColor = (ply: number): Color => (ply % 2 === 1 ? 'white' : 'black');

export const autoTagNode = (node: TreeNode, parent?: TreeNode): void => {
  if (!parent) return;
  const nodeEval = node.ceval || node.eval;
  const parentEval = parent.ceval || parent.eval;
  if (!nodeEval || !parentEval) return;

  const color = plyColor(node.ply);
  const diff = winningChances.povDiff(color, parentEval, nodeEval);
  console.log(diff);
  const glyphs = (node.glyphs || []).filter(g => !['?!', '?', '??', '!!'].includes(g.symbol));

  let newGlyph;
  if (diff > BLUNDER) newGlyph = { id: 4, symbol: '??', name: 'Blunder' };
  else if (diff > MISTAKE) newGlyph = { id: 2, symbol: '?', name: 'Mistake' };
  else if (diff > INACCURACY) newGlyph = { id: 6, symbol: '?!', name: 'Inaccuracy' };

  if (newGlyph) node.glyphs = [...glyphs, newGlyph];
  else if (glyphs.length) node.glyphs = glyphs;
  else node.glyphs = undefined;
};

export const autoTagTree = (root: TreeNode): void => {
  const iter = (node: TreeNode, parent?: TreeNode) => {
    autoTagNode(node, parent);
    node.children.forEach(c => iter(c, node));
  };
  iter(root);
};
