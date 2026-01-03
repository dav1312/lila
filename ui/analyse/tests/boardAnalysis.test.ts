import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSquare } from 'chessops/util';
import { parseFen, detectPins, detectUndefended, detectCheckable } from '../src/boardAnalysis';

// Helper to run all algorithms and return a simple string array for comparison
// Returns strings in format: "square:type" (e.g., "e5:pin")
function runAnalysis(fen: string): string[] {
  const parts = fen.split(' ');
  const board = parseFen(parts[0]);
  const epSquare = parts[3] && parts[3] !== '-' ? (parseSquare(parts[3]) ?? null) : null;

  const shapes = [
    ...detectPins(board),
    ...detectUndefended(board),
    ...detectCheckable(board, epSquare, parts[2]),
  ];

  return shapes.map(s => `${s.orig}:${s.brush}`).sort();
}

test('Pin: Absolute', () => {
  const fen = '4k3/4p3/8/8/8/4R3/8/K7 w - - 0 1';
  const expected = ['e8:checkable', 'e7:pin'].sort();

  assert.deepEqual(runAnalysis(fen), expected);
});

test('Pin: Relative', () => {
  const fen = '4q2k/4p2p/8/8/8/4R3/P7/K7 w - - 0 1';
  const expected = ['e7:pin'].sort();

  assert.deepEqual(runAnalysis(fen), expected);
});

test('Pin: No pin if trade', () => {
  const fen = 'k2q1b2/8/3n4/8/1B6/8/7P/7K w - - 0 1';
  const expected: string[] = [];

  assert.deepEqual(runAnalysis(fen), expected);
});

test('Checkable: Castling', () => {
  const fen = '8/8/8/8/8/8/3PPP2/k3K2R w K - 0 1';
  const expected = ['a1:checkable'].sort();

  assert.deepEqual(runAnalysis(fen), expected);
});

test('Checkable: En passant', () => {
  const fen = '7k/8/8/8/4Pp2/8/3K4/8 b - e3 0 1';
  const expected = ['d2:checkable'].sort();

  assert.deepEqual(runAnalysis(fen), expected);
});

test('Checkable: Promotion', () => {
  const fen = '8/2P1k3/8/8/8/8/8/2K5 w - - 0 1';
  const expected = ['e7:checkable'].sort();

  assert.deepEqual(runAnalysis(fen), expected);
});

test('Undefended: Fork', () => {
  const fen = '8/5k2/2p1n3/3P4/8/8/8/2K5 w - - 0 1';
  const expected = ['f7:checkable', 'c6:undefended', 'e6:undefended', 'd5:undefended'].sort();

  assert.deepEqual(runAnalysis(fen), expected);
});

test('Undefended: Underdefended pawn', () => {
  const fen = '6k1/8/8/r7/1b6/P7/1B5P/7K w - - 0 1';
  const expected = ['b4:undefended', 'a3:undefended'].sort();

  assert.deepEqual(runAnalysis(fen), expected);
});

test('Undefended: Losing trade', () => {
  const fen = '7k/6p1/5p2/r7/1b6/P7/1Q5P/2B4K w - - 0 1';
  const expected = ['b4:undefended', 'a3:undefended'].sort();

  assert.deepEqual(runAnalysis(fen), expected);
});

test('Undefended: Defended pawn (order of trades)', () => {
  const fen = '6rk/6pp/5p2/r7/1b6/P3Q3/1B5P/7K w - - 0 1';
  const expected = ['b4:undefended'].sort();

  assert.deepEqual(runAnalysis(fen), expected);
});

test('Multiple tests (1)', () => {
  const fen = '8/6qk/1p2p3/pBn1p1pP/P3PbN1/2P2P2/KP1r2Q1/6R1 w - - 0 1';
  const expected = ['g2:undefended', 'b2:pin', 'a2:checkable', 'h7:checkable'].sort();

  assert.deepEqual(runAnalysis(fen), expected);
});

test('Multiple tests (2)', () => {
  const fen = '3r2k1/pp3p2/2p1Nnpb/q1B1p3/4P2P/P1N2Pp1/KPPn4/5BQR w - - 0 1';
  const expected = [
    'd8:undefended',
    'a7:undefended',
    'e6:undefended',
    'f3:undefended',
    'g3:undefended',
    'a3:pin',
    'a2:checkable',
  ].sort();

  assert.deepEqual(runAnalysis(fen), expected);
});
