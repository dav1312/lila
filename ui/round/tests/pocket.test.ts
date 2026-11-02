import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { NodeCrazy } from 'lib/tree/types';

import type { RoundData } from '../src/interfaces';
import { setPocket } from '../src/util';

const pocket = (pawns: number): NodeCrazy =>
  ({
    pockets: [
      { pawn: pawns, knight: 0, bishop: 0, rook: 0, queen: 0 },
      { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 },
    ],
    promoted: [],
  }) as unknown as NodeCrazy;

const roundData = (): RoundData =>
  ({
    crazyhouse: pocket(0),
    steps: [
      { ply: 1, fen: 'a', crazy: pocket(0) },
      { ply: 2, fen: 'b', crazy: pocket(0) },
    ],
  }) as unknown as RoundData;

describe('setPocket', () => {
  test('replaces the current pocket and the latest step pocket', () => {
    const d = roundData();
    const incoming = pocket(1);
    setPocket(d, incoming);
    assert.equal(d.crazyhouse, incoming);
    assert.equal(d.steps[1].crazy, incoming);
  });

  test('leaves earlier steps untouched', () => {
    const d = roundData();
    const before = d.steps[0].crazy;
    setPocket(d, pocket(2));
    assert.equal(d.steps[0].crazy, before);
  });
});
