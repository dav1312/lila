import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isBrilliantMove } from '../src/brilliant';
import type { MoveEvals } from '../src/importantMove';

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

// each guard test starts from a brilliant sacrifice and breaks only the guard it tests,
// so a rejection can only come from that guard
const GUARD_BASE: PositionCase = {
  name: 'Nf7 sacrifice',
  fen: 'rnbqkbnr/pp2p1p1/7p/2P2pN1/3p4/5N2/PP3PPP/R1BQKB1R w KQkq - 0 9',
  move: 'Nf7',
  expected: true,
};

describe('isBrilliantMove - guard conditions', () => {
  it('starting sacrifice is brilliant', () => {
    assert.equal(isBrilliantMove(buildMove(GUARD_BASE)), true);
  });

  it('rejects moves that are not the engine top move', () => {
    assert.equal(isBrilliantMove({ ...buildMove(GUARD_BASE), best: 'a2a3' }), false);
  });

  it('rejects when the position has no score', () => {
    assert.equal(isBrilliantMove({ ...buildMove(GUARD_BASE), score: undefined }), false);
  });

  it('rejects when the mover is still winning on the second line', () => {
    assert.equal(isBrilliantMove(buildMove({ ...GUARD_BASE, secondLineEval: '+9.00' })), false);
  });

  it('rejects when the mover is losing', () => {
    assert.equal(isBrilliantMove(buildMove({ ...GUARD_BASE, eval: '-3.00' })), false);
  });
});

interface PositionCase {
  name: string;
  fen: string;
  move: string;
  eval?: ScoreInput;
  secondLineEval?: ScoreInput;
  // the engine's main line after `move`, in SAN
  line?: string[];
  expected: boolean;
}

function buildMove(c: PositionCase): MoveEvals {
  const setup = parseFen(c.fen);
  if ('error' in setup) throw new Error(`Invalid FEN: ${c.fen}`);

  const pos = Chess.fromSetup(setup.value);
  if ('error' in pos) throw new Error(`Invalid position: ${c.fen}`);

  const move = parseSan(pos.value, c.move);
  if (!move) throw new Error(`Illegal move "${c.move}" in ${c.fen}`);

  const uci = makeUci(move);
  const line = pos.value.clone();
  const pv = [c.move, ...(c.line ?? [])].map(san => {
    const m = parseSan(line, san);
    if (!m) throw new Error(`Illegal line move "${san}" in ${c.fen}`);
    line.play(m);
    return makeUci(m);
  });
  return {
    fen: c.fen,
    uci,
    score: parseScore(c.eval ?? 0),
    best: uci,
    second: c.secondLineEval === undefined ? undefined : parseScore(c.secondLineEval),
    pv: c.line ? pv : undefined,
  };
}

const POSITION_CASES: PositionCase[] = [
  {
    name: 'Piece sacrifice',
    fen: 'rnbqkbnr/pp2p1p1/7p/2P2pN1/3p4/5N2/PP3PPP/R1BQKB1R w KQkq - 0 9',
    move: 'Nf7',
    expected: true,
  },
  {
    name: 'Leaving piece en prise',
    fen: 'rnbq1bnr/pp2p1p1/5k1p/2P1Np2/3p4/8/PP3PPP/R1BQKB1R w KQ - 2 11',
    move: 'Qh5',
    expected: true,
  },
  {
    name: 'Leave two pieces en prise',
    fen: 'r1b2r2/1p1n1p1k/p1p4p/2bpp3/4P1Q1/2NP1P2/PqP3P1/R3KB1R w KQ - 0 4',
    move: 'Qg5',
    expected: true,
  },
  {
    name: 'Piece sacrifice with decisive advantage',
    fen: '1k1r1b1r/1pp1nppp/1P6/4p2q/3n4/2NP1NP1/3BPP1P/R2Q1bK1 w - - 0 18',
    move: 'Ra8+',
    expected: true,
  },
  {
    name: 'Piece sacrifice with mate',
    fen: 'r1b2r2/1p1n1p2/p1p3kp/2bpp1N1/4P1Q1/2NP1P2/PqP3P1/R3KB1R w KQ - 4 3',
    move: 'Nh7+',
    expected: true,
  },
  {
    name: 'Piece sacrifice with check and en prise with mate',
    fen: 'rnb2bnr/pp2p1p1/7p/2q1kp1Q/2Bp4/8/PP3PPP/R1BK3R w - - 0 14',
    move: 'Bf4+',
    expected: true,
  },
  {
    name: 'Rook for minor piece sacrifice',
    fen: '3b1r2/8/1knq4/1p2pB1p/3pP3/2pP4/Q1P2B1K/R7 b - - 0 1',
    move: 'Rxf5',
    expected: true,
  },
  {
    name: 'Greek gift',
    fen: 'rnbq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 1',
    move: 'Bxh7+',
    expected: true,
  },
  {
    name: 'Forced queen sacrifice with mate',
    fen: '2b5/k2n1p2/p2q4/5R1B/2p4P/P1b5/KPQ1R3/6r1 b - - 2 37',
    move: 'Qxa3+',
    expected: true,
  },
  {
    name: 'Smothered mate',
    fen: '4r2k/6pp/7N/3Q4/8/8/8/6K1 w - - 0 1',
    move: 'Qg8+',
    expected: true,
  },
  {
    name: 'Every reply allows mate in one',
    fen: 'r1bk2nr/p2p1pNp/n2B4/1p1NP2P/6P1/3P1Q2/P1P1K3/q5b1 w - - 1 22',
    move: 'Qf6+',
    expected: true,
  },
  {
    // Nxc1 Bxa6 Qxa6 drags the queen off the c3 bishop, so the rook is won back.
    // the queen is what is sacrificed: Bxd2 Rxc8 Nxc8 Rxd2 gives up 2
    name: 'Queen sacrifice behind a rook offer (Rc1)',
    fen: '2q2Nk1/4n2p/b2p2p1/p7/4pP2/2bn2P1/1R1Q1B1P/R4BK1 w - - 0 25',
    move: 'Rc1',
    expected: true,
  },
  {
    // castling is encoded as the king taking its own rook, which is no capture
    name: 'Castling leaves piece en prise',
    fen: 'rnbqkb1r/ppp2ppp/3p1n2/4N3/8/8/PPPPBPPP/RNBQK2R w KQkq - 0 1',
    move: 'O-O',
    expected: true,
  },
  {
    name: 'Trading a hanging piece leaves queen en prise',
    fen: '1n4k1/3b1ppp/p3p3/1B3Q2/8/8/5PPP/6K1 w - - 0 1',
    move: 'Bxd7',
    expected: true,
  },
  {
    name: "Sacrifice in a worse position (Kasparov's Rxd4)",
    fen: 'b2r3r/k4p1p/p2q1np1/NppP4/3p1Q2/P4PPB/1PP4P/1K1RR3 w - - 1 24',
    move: 'Rxd4',
    eval: '-0.50',
    expected: true,
  },
  {
    name: 'Exchange left en prise',
    fen: '3rq1k1/5ppp/2n1r1b1/pp2P3/P1pP1QB1/2P1R3/1B4PP/4R1K1 b - - 0 26',
    move: 'Ne7',
    expected: true,
  },
  {
    // exf6 Nxf6 Bxf6 only wins the piece back if black recaptures
    name: 'Greek gift with a declinable even trade',
    fen: 'r1b1nrk1/1pq2p1p/p3pp2/3pP3/1bPB4/3B4/PP3PPP/R2Q1RK1 w - - 0 14',
    move: 'Bxh7+',
    expected: true,
  },
  {
    // the a6 knight was already hanging before Ng6+, so neither hxg6 nor Bxb5 Rxb5 wins it back.
    // the f8 rook is no longer attacked after hxg6
    name: 'Knight sacrifice with mate (Ng6+)',
    fen: '1r1q1r1k/6pp/n4n2/1b2N3/1bBB4/4R3/2P2PPP/R2Q2K1 w - - 0 22',
    move: 'Ng6+',
    expected: true,
  },
  {
    // the e4 knight was already hanging before Nb4, so taking it does not win the knight back
    name: 'Knight left en prise (Nb4)',
    fen: '5rk1/1pp1qpp1/r1n3b1/p5Rn/P2pN2P/1P1PP2N/1Q2BP2/2KR4 b - - 3 22',
    move: 'Nb4',
    expected: true,
  },
  {
    // the rook for the bishop is not offset by the loose h2 and a7 pawns
    name: 'Exchange sacrifice on a capture (Rxe8)',
    fen: '2krb1R1/ppp1n3/8/3P1nP1/8/2N1B1P1/PP5p/R6K w - - 3 29',
    move: 'Rxe8',
    expected: true,
  },
  {
    // the d1 rook was already hanging before Be6, so only Bxc4 offsets the queen
    name: 'Queen sacrifice (Be6)',
    fen: 'r3r1k1/pp3pbp/1qp3p1/2B5/2BP2b1/Q1n2N2/P4PPP/3R1K1R b - - 3 17',
    move: 'Be6',
    expected: true,
  },
  {
    // nothing is loose after Qxc5. Re8+ and Qe6+ win the material back later, which does not count
    name: 'Decoy sacrifice (Bc5)',
    fen: '6k1/1b4pp/p2q4/3PR1P1/3BQ2P/1PP5/1P1K4/5r2 w - - 1 34',
    move: 'Bc5',
    expected: true,
  },
  {
    // white's queen is protected (Bxd1 Raxd1) and so is black's (Bxd7+ Rxd7): neither side sacrifices
    name: 'Queen offered for queen (Ba4)',
    fen: '2kr4/pppqn1p1/6n1/3P2P1/6b1/1BN1B1P1/PP5p/R2QR2K w - - 1 23',
    move: 'Ba4',
    expected: false,
  },
  {
    // Rxf5 leaves the e7 bishop undefended: Rxe7
    name: 'Capture leaves a piece undefended (Bxf5)',
    fen: 'rq4k1/1b1nbrpp/p2p4/3P1pP1/1p1B1P1P/3B1Q2/PPP5/2K1R2R w - - 1 20',
    move: 'Bxf5',
    expected: false,
  },
  {
    // Qxe7 leaves the f5 rook undefended: Qxf5
    name: 'Capture leaves a rook undefended (fxe5)',
    fen: 'r4qk1/1b2R1pp/p2p4/3PnrP1/1p1BQP1P/8/PPP5/2K4R w - - 3 23',
    move: 'fxe5',
    expected: false,
  },
  {
    // exd4 opens the e-file: Rxe7
    name: 'Capture opens a line (Re1)',
    fen: 'r5k1/1b2q1pp/p7/3Pp1P1/1p1B3P/5Q2/PPP5/2K4R w - - 0 27',
    move: 'Re1',
    expected: false,
  },
  {
    // the h2 knight hangs to Rxh2+, which offsets all but 1 of the knight
    name: 'Knight offered for a hanging knight (Nf3)',
    fen: '4q2r/k1p5/4nP2/1p5r/pP1p2Rn/P2P4/2PBQ2N/5R1K b - - 0 1',
    move: 'Nf3',
    expected: false,
  },
  {
    // Rxe7+ Nxe7 fxe7 gives the rook for two knights
    // the Qxg2# threat plays no part, only material counts
    name: 'Capture that wins material',
    fen: '1r2k1r1/pbppnp1p/1bn2P2/8/Q7/B1PB1q2/P4PPP/3RR1K1 w - - 0 20',
    move: 'Rxe7+',
    expected: false,
  },
  {
    // white's queen falls to a bishop (Bxd1 Raxd1) and black's only to a rook (Rxf5 Nxf5), so white gives up 2.
    // Bxd1 Rxf5 Bxa4 Rxf7 wins the material back later, which does not count
    name: 'Queen left en prise for a protected queen (Rf1)',
    fen: '2kr4/ppp1n1p1/6n1/3P1qP1/B5b1/2N1B1P1/PP5p/R2QR2K w - - 3 24',
    move: 'Rf1',
    expected: true,
  },
  {
    // the h6 rook was already hanging before Rd6, and the queen is no longer attacked once the rook is taken.
    // Qxd6 Nxd6+ and Bxd6 Nxg7+ win the material back later, which does not count
    name: 'Rook sacrifice (Rd6)',
    fen: '2r1kb2/1p4p1/nBp1q2r/4pN1P/4pPQ1/4P3/P5P1/3R2K1 w - - 6 30',
    move: 'Rd6',
    expected: true,
  },
  {
    name: 'Knight for rook',
    fen: '8/5k2/5p2/qp5p/2r2p1P/5P2/N3nP2/1Q4RK b - - 1 8',
    move: 'Nxg1',
    expected: false,
  },
  {
    name: 'Mover in check',
    fen: '5rk1/1p4bp/1p1N4/3Pp3/P3P2q/BQ3bRp/5r1P/6RK w - - 0 1',
    move: 'Qxf3',
    expected: false,
  },
  {
    name: 'Giving check prevents taking the piece',
    fen: 'r2qkb1r/pp1b1ppp/4pn2/1BpP4/3n4/2N5/PPPPQPPP/R1B1K1NR w KQkq - 3 9',
    move: 'Bxd7+',
    expected: false,
  },
  {
    name: 'Trapped piece left en prise',
    fen: 'rnb1k1nN/ppp3bp/3p4/7p/4p3/4P3/PPPP1PPP/RNB1K2R w KQq - 1 9',
    move: 'Nc3',
    expected: false,
  },
  {
    name: 'Trapped piece left en prise',
    fen: 'r1k5/B1p2ppp/1p6/8/8/8/5PPP/3R2K1 w - - 0 1',
    move: 'h3',
    expected: false,
  },
  {
    name: 'Pinned piece already lost',
    fen: '4r2k/8/8/8/8/4B3/P7/4K3 w - - 0 1',
    move: 'a3',
    expected: false,
  },
  {
    name: 'Desperado with trapped piece',
    fen: '1k6/7q/5np1/4p1Br/4P2p/4QP1P/6P1/6K1 b - - 0 1',
    move: 'Rxg5',
    expected: false,
  },
  {
    // Qxd4 Qxd4 exd4 Bxe4 and exd4 Bxe4 win the piece back
    name: 'Even trade wins back the piece',
    fen: 'r2qk2r/pbp1bppp/1pn1p3/8/3PNB2/4P3/PPP1BPPP/R2Q1RK1 b kq - 0 10',
    move: 'Nxd4',
    expected: false,
  },
  {
    name: 'Rook for bishop and knight',
    fen: '5rk1/p4ppp/2n5/1B2p3/1b6/5N2/PP3PPP/3QR1K1 w - - 0 1',
    move: 'Bxc6',
    expected: false,
  },
  {
    name: "The mover's hanging material shrinks",
    fen: '6k1/5pp1/4p2p/3Q1N2/8/8/5PPP/6K1 w - - 0 1',
    move: 'Qd1',
    expected: false,
  },
  {
    // Rxc4 Re8#
    name: 'Capture allows mate in one',
    fen: '2r3k1/5ppp/8/8/8/1B6/5PPP/4R1K1 w - - 0 1',
    move: 'Bc4',
    expected: false,
  },
  {
    // Rxc1 Qxe7 Rxd1+ gives the queen for two rooks
    name: 'Capture that unpins wins material',
    fen: '2k5/1pp1q3/4p2p/PPr1r1p1/8/Q4P1P/8/2RR2K1 b - - 1 32',
    move: 'Rxc1',
    expected: false,
  },
  {
    // Rxh6 Rxc8+ mates; Rcxh6 wins the rook on h6 or Rxc8+ the bishop, never both with the one rook
    name: 'One piece cannot win back two pieces',
    fen: 'k1b4r/q4p2/p1R5/b2P4/r3p2p/PR2Q3/1PP3PP/1K3B2 w - - 4 34',
    move: 'Qh6',
    expected: true,
  },
  {
    // fxe6 hangs the f8 rook, and Qxe6 just loses the queen
    name: 'Capturing with a piece that is then lost',
    fen: '5r2/ppr1ppk1/1n1q2p1/3P3p/5R1P/1BP2Q2/P4PP1/4R1K1 w - - 4 20',
    move: 'Re6',
    expected: false,
  },
  {
    // the f6 queen was hanging before Ne2+, and the engine line takes it right after the capture
    name: 'Desperado before taking a hanging queen',
    fen: 'r1b2rk1/pp1ppp1p/5Qp1/q7/3nP3/1BN1B3/PPP2PPP/R4RK1 b - - 0 12',
    move: 'Ne2+',
    line: ['Nxe2', 'exf6'],
    expected: false,
  },
  {
    name: 'Queen for two rooks',
    fen: '4rk2/pq1r4/4PPQ1/1p6/2p2P2/8/PP3P1P/4R1K1 w - - 3 31',
    move: 'Qxe8+',
    line: ['Kxe8', 'exd7+'],
    expected: false,
  },
  {
    // the d8 knight was hanging before, but the engine line ignores it and mates
    name: 'Sacrifice ignoring a hanging piece',
    fen: 'r1bNk2r/p1pp2pp/8/1pn1p3/3n4/1BK5/PPPP1bPP/RNBQ3R b kq - 2 10',
    move: 'Ne2+',
    line: ['Qxe2', 'Bd4+'],
    expected: true,
  },
];

describe('isBrilliantMove - position evaluations', () => {
  for (const c of POSITION_CASES) {
    it(`${c.expected ? 'Brilliant' : 'Not brilliant'}: ${c.name}`, () => {
      assert.equal(isBrilliantMove(buildMove(c)), c.expected);
    });
  }
});
