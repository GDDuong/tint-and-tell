import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CELLS,
  COLS,
  chebyshev,
  cueError,
  guessersFor,
  pawnPoints,
  pickCandidates,
  placementPoints,
  scoreRound,
} from '../src/game.ts';

test('chebyshev uses grid distance without wrapping', () => {
  assert.equal(chebyshev(0, 0), 0);
  assert.equal(chebyshev(0, 1), 1);
  assert.equal(chebyshev(0, COLS), 1);
  assert.equal(chebyshev(0, COLS + 1), 1);
  assert.equal(chebyshev(0, COLS * 2), 2);
  assert.equal(chebyshev(0, CELLS - 1), 23);
});

test('pawn points: 3 inside, then 2, then 1', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(pawnPoints), [3, 2, 1, 0, 0]);
});

test('giver scores 1 per pawn in the frame, 2 in a 3-player game', () => {
  const target = 5 * COLS + 5;
  const inFrame = { playerId: 0, pawn: 1 as const, cell: target + 1 };
  const outside = { playerId: 0, pawn: 2 as const, cell: target + 3 };
  assert.equal(placementPoints(inFrame, 0, target, 4), 1);
  assert.equal(placementPoints(outside, 0, target, 4), 0);
  assert.equal(placementPoints(inFrame, 0, target, 3), 2);
  assert.equal(placementPoints(inFrame, 1, target, 4), pawnPoints(1));
});

test('round scores combine all pawns', () => {
  const target = 5 * COLS + 5;
  const placements = [
    { playerId: 0, pawn: 1 as const, cell: target },
    { playerId: 0, pawn: 2 as const, cell: target + 3 },
    { playerId: 1, pawn: 1 as const, cell: target + 1 },
    { playerId: 1, pawn: 2 as const, cell: target },
    { playerId: 2, pawn: 1 as const, cell: target - COLS + 1 },
    { playerId: 2, pawn: 2 as const, cell: target + COLS * 4 },
  ];
  assert.deepEqual(scoreRound(0, target, placements, 4), [1, 5, 2, 0]);
});

test('guesser order rotates around the giver', () => {
  assert.deepEqual(guessersFor([0, 1, 2, 3], 0), [1, 2, 3]);
  assert.deepEqual(guessersFor([0, 1, 2, 3], 2), [3, 0, 1]);
});

test('cue rules: word counts, color names, coordinates', () => {
  assert.equal(cueError('sunset', 1), null);
  assert.match(cueError('warm sunset', 1) ?? '', /exactly one/);
  assert.equal(cueError('warm sunset', 2), null);
  assert.match(cueError('warm sunset glow', 2) ?? '', /at most two/);
  assert.match(cueError('blue', 1) ?? '', /color name/);
  assert.match(cueError('Blue!', 2) ?? '', /color name/);
  assert.match(cueError('B7', 2) ?? '', /coordinates/);
  assert.match(cueError('   ', 1) ?? '', /Type a cue/);
});

test('cue errors translate to Vietnamese', () => {
  assert.match(cueError('warm sunset', 1, 'vi') ?? '', /một từ/);
  assert.match(cueError('blue', 1, 'vi') ?? '', /tên màu/);
  assert.match(cueError('B7', 2, 'vi') ?? '', /tọa độ/);
});

test('blocked words: expanded English list and Vietnamese', () => {
  for (const w of ['violet', 'VIOLET', 'peach', 'navy', 'turquoise', 'crimson']) {
    assert.match(cueError(w, 1) ?? '', /color name/, `${w} blocked`);
  }
  for (const w of ['đỏ', 'ĐỎ', 'xanh', 'tím', 'vàng', 'hồng']) {
    assert.match(cueError(w, 1, 'vi') ?? '', /tên màu/, `${w} blocked in vi`);
  }
  assert.equal(cueError('vang', 1), null, 'undiacritized viet words slip through (documented)');
});

test('coordinates are blocked in any spelling', () => {
  for (const c of ['B7', 'b7!', 'B-7', '7b', '42']) {
    assert.match(cueError(c, 2) ?? '', /coordinates/, `${c} blocked`);
  }
  assert.match(cueError('B7', 2, 'vi') ?? '', /tọa độ/);
  assert.equal(cueError('sunset', 2), null);
});

test('target candidates are distinct and spaced apart', () => {
  for (let run = 0; run < 40; run++) {
    const picks = pickCandidates();
    assert.equal(picks.length, 4);
    assert.equal(new Set(picks).size, 4);
    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        assert.ok(chebyshev(picks[i], picks[j]) >= 3);
      }
    }
  }
});
