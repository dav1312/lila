import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ClientEval, TreeNode } from 'lib/tree/types';

import { isBrilliantMove } from '../src/liveBrilliant';

interface Score {
  cp?: number;
  mate?: number;
}

type ScoreInput = Score | string | number;

function parseScore(input: ScoreInput): Score {
  if (typeof input === 'number') return { cp: input };
  if (typeof input === 'object') return input;

  const mate = /^([+-])?M(\d+)$/i.exec(input);
  if (mate) {
    const sign = mate[1] === '-' ? -1 : 1;
    return { mate: sign * Number(mate[2]) };
  }

  return { cp: Math.round(Number.parseFloat(input) * 100) };
}

function createEval(
  score: ScoreInput,
  fen: string,
  bestmove = '(none)',
  secondLineScores: ScoreInput[] = [],
): ClientEval {
  const parsed = parseScore(score);
  return {
    cloud: true,
    fen,
    depth: 20,
    nodes: 0,
    ...parsed,
    bestmove,
    pvs: [
      { ...parsed, moves: [bestmove] },
      ...secondLineScores.map(s => ({ ...parseScore(s), moves: ['a2a3'] })),
    ],
  };
}

function createNode(fen: string, uci?: string, ceval?: ClientEval): TreeNode {
  return { fen, uci, ceval, ply: 1, children: [] } as unknown as TreeNode;
}

// each guard test starts from a brilliant sacrifice and breaks only the guard it tests,
// so a rejection can only come from that guard
const GUARD_BASE: PositionCase = {
  name: 'Nf7 sacrifice',
  fen: 'rnbqkbnr/pp2p1p1/7p/2P2pN1/3p4/5N2/PP3PPP/R1BQKB1R w KQkq - 0 9',
  move: 'Nf7',
  eval: '+5.00',
  childEval: '+5.00',
  secondLineEval: '+0.50',
  expected: true,
};

describe('isBrilliantMove - guard conditions', () => {
  it('starting sacrifice is brilliant', () => {
    const { parent, child } = buildPositionNodes(GUARD_BASE);
    assert.equal(isBrilliantMove(parent, child), true);
  });

  it('rejects moves that are not the engine top move', () => {
    const { parent, child } = buildPositionNodes(GUARD_BASE);
    parent.ceval = createEval('+5.00', GUARD_BASE.fen, 'a2a3', ['+0.50']);
    assert.equal(isBrilliantMove(parent, child), false);
  });

  it('rejects when the child has no evaluation yet', () => {
    const { parent, child } = buildPositionNodes(GUARD_BASE);
    child.ceval = undefined;
    assert.equal(isBrilliantMove(parent, child), false);
  });

  it('rejects when the mover is still winning on the second line', () => {
    const { parent, child } = buildPositionNodes({ ...GUARD_BASE, secondLineEval: '+9.00' });
    assert.equal(isBrilliantMove(parent, child), false);
  });

  it('rejects when the mover is losing after the move', () => {
    const { parent, child } = buildPositionNodes({ ...GUARD_BASE, childEval: '-3.00' });
    assert.equal(isBrilliantMove(parent, child), false);
  });
});

interface PositionCase {
  name: string;
  fen: string;
  move: string;
  eval: ScoreInput;
  childEval: ScoreInput;
  secondLineEval: ScoreInput;
  expected: boolean;
}

function buildPositionNodes(c: PositionCase): { parent: TreeNode; child: TreeNode } {
  const setup = parseFen(c.fen);
  if ('error' in setup) throw new Error(`Invalid FEN: ${c.fen}`);

  const pos = Chess.fromSetup(setup.value);
  if ('error' in pos) throw new Error(`Invalid position: ${c.fen}`);

  const move = parseSan(pos.value, c.move);
  if (!move) throw new Error(`Illegal move "${c.move}" in ${c.fen}`);

  const uci = makeUci(move);
  const after = pos.value.clone();
  after.play(move);
  const afterFen = makeFen(after.toSetup());

  return {
    parent: createNode(c.fen, undefined, createEval(c.eval, c.fen, uci, [c.secondLineEval])),
    child: createNode(afterFen, uci, createEval(c.childEval, afterFen, '(none)')),
  };
}

const POSITION_CASES: PositionCase[] = [
  {
    name: 'Piece sacrifice',
    fen: 'rnbqkbnr/pp2p1p1/7p/2P2pN1/3p4/5N2/PP3PPP/R1BQKB1R w KQkq - 0 9',
    move: 'Nf7',
    eval: '+5.00',
    childEval: '+5.00',
    secondLineEval: '+0.50',
    expected: true,
  },
  {
    name: 'Leaving piece en prise',
    fen: 'rnbq1bnr/pp2p1p1/5k1p/2P1Np2/3p4/8/PP3PPP/R1BQKB1R w KQ - 2 11',
    move: 'Qh5',
    eval: '+5.00',
    childEval: '+5.00',
    secondLineEval: '-3.00',
    expected: true,
  },
  {
    name: 'Leave two pieces en prise',
    fen: 'r1b2r2/1p1n1p1k/p1p4p/2bpp3/4P1Q1/2NP1P2/PqP3P1/R3KB1R w KQ - 0 4',
    move: 'Qg5',
    eval: '+M8',
    childEval: '+M7',
    secondLineEval: '-7.00',
    expected: true,
  },
  {
    name: 'Piece sacrifice with decisive advantage',
    fen: '1k1r1b1r/1pp1nppp/1P6/4p2q/3n4/2NP1NP1/3BPP1P/R2Q1bK1 w - - 0 18',
    move: 'Ra8+',
    eval: '+10.00',
    childEval: '+10.00',
    secondLineEval: '-1.00',
    expected: true,
  },
  {
    name: 'Piece sacrifice with mate',
    fen: 'r1b2r2/1p1n1p2/p1p3kp/2bpp1N1/4P1Q1/2NP1P2/PqP3P1/R3KB1R w KQ - 4 3',
    move: 'Nh7+',
    eval: '+M9',
    childEval: '+M8',
    secondLineEval: '-3.27',
    expected: true,
  },
  {
    name: 'Piece sacrifice with check and en prise with mate',
    fen: 'rnb2bnr/pp2p1p1/7p/2q1kp1Q/2Bp4/8/PP3PPP/R1BK3R w - - 0 14',
    move: 'Bf4+',
    eval: '+M3',
    childEval: '+M2',
    secondLineEval: '-2.00',
    expected: true,
  },
  {
    name: 'Rook for minor piece sacrifice',
    fen: '3b1r2/8/1knq4/1p2pB1p/3pP3/2pP4/Q1P2B1K/R7 b - - 0 1',
    move: 'Rxf5',
    eval: '-3.00',
    childEval: '-3.00',
    secondLineEval: '-1.00',
    expected: true,
  },
  {
    name: 'Greek gift',
    fen: 'rnbq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 1',
    move: 'Bxh7+',
    eval: '+4.00',
    childEval: '+4.00',
    secondLineEval: '+2.00',
    expected: true,
  },
  {
    name: 'Sacrifice in a worse position (Kasparov\'s Rxd4)',
    fen: 'b2r3r/k4p1p/p2q1np1/NppP4/3p1Q2/P4PPB/1PP4P/1K1RR3 w - - 1 24',
    move: 'Rxd4',
    eval: '-0.50',
    childEval: '-0.50',
    secondLineEval: '-1.00',
    expected: true,
  },
  {
    name: 'Piece sacrifice but punished recapture',
    fen: '4q2r/k1p5/4nP2/1p5r/pP1p2Rn/P2P4/2PBQ2N/5R1K b - - 0 1',
    move: 'Nf3',
    eval: '-7.00',
    childEval: '-7.00',
    secondLineEval: '-0.50',
    expected: false,
  },
  {
    name: 'Piece sacrifice but punished recapture',
    fen: '3rq1k1/5ppp/2n1r1b1/pp2P3/P1pP1QB1/2P1R3/1B4PP/4R1K1 b - - 0 26',
    move: 'Ne7',
    eval: '+0.20',
    childEval: '+0.20',
    secondLineEval: '+1.00',
    expected: false,
  },
  {
    name: 'Piece sacrifice but punished recapture',
    fen: '1r2k1r1/pbppnp1p/1bn2P2/8/Q7/B1PB1q2/P4PPP/3RR1K1 w - - 0 20',
    move: 'Rxe7+',
    eval: '+5.00',
    childEval: '+5.00',
    secondLineEval: '-5.00',
    expected: false,
  },
  {
    name: 'Knight for rook',
    fen: '8/5k2/5p2/qp5p/2r2p1P/5P2/N3nP2/1Q4RK b - - 1 8',
    move: 'Nxg1',
    eval: '-6.00',
    childEval: '-6.00',
    secondLineEval: '0.00',
    expected: false,
  },
  {
    name: 'Sacrifice but in check',
    fen: '5rk1/1p4bp/1p1N4/3Pp3/P3P2q/BQ3bRp/5r1P/6RK w - - 0 1',
    move: 'Qxf3',
    eval: '+5.00',
    childEval: '+5.00',
    secondLineEval: '-M2',
    expected: false,
  },
];

describe('isBrilliantMove - position evaluations', () => {
  for (const c of POSITION_CASES) {
    it(`${c.expected ? 'Brilliant' : 'Not brilliant'}: ${c.name}`, () => {
      const { parent, child } = buildPositionNodes(c);
      assert.equal(isBrilliantMove(parent, child), c.expected);
    });
  }
});
