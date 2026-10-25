import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gameView,
  nextRound,
  startGame,
  submitCue1,
  submitCue2,
  submitPlacement,
  submitVote,
  syncGame,
} from '../server/game.ts';
import { DEFAULT_SETTINGS, chebyshev, normalizeSettings } from '../src/game.ts';

const players = [{ id: 1 }, { id: 2 }, { id: 3 }];

function near(target: number): number {
  return Math.floor(target / 24) + 1 < 20 ? target + 24 : target - 24;
}

function farther(target: number, distance: number): number {
  const row = Math.floor(target / 24);
  return row + distance < 20 ? target + distance * 24 : target - distance * 24;
}

test('a full online round goes cue 1 -> reveal with hidden target', () => {
  const game = startGame(players, 1);
  assert.equal(game.giverId, 1);
  assert.deepEqual(game.order, [1, 2, 3]);
  assert.equal(game.phase, 'cue1');
  assert.equal(gameView(game, 1).candidates?.length, 4);
  assert.equal(gameView(game, 2).candidates, null);

  const target = game.candidates[0];
  assert.match(submitCue1(game, 2, target, 'sunset') ?? '', /giver/);
  assert.match(submitCue1(game, 1, target, 'red') ?? '', /color name/);
  assert.equal(submitCue1(game, 1, target, 'sunset'), null);
  assert.equal(game.phase, 'place1');
  assert.equal(gameView(game, 2).target, null);
  assert.equal(gameView(game, 1).target, target);
  assert.equal(submitCue2(game, 1, 'warm sand'), 'Not time for cue 2.');

  const far1 = farther(target, 5);
  const far2 = farther(target, 2);
  assert.equal(submitPlacement(game, 2, target), null);
  assert.equal(game.phase, 'place1');
  assert.equal(submitPlacement(game, 3, far1), null);
  assert.equal(game.phase, 'cue2');

  assert.equal(submitCue2(game, 1, 'warm sand'), null);
  assert.equal(game.phase, 'place2');
  assert.equal(submitPlacement(game, 2, near(target)), null);
  assert.equal(game.phase, 'place2');
  assert.equal(submitPlacement(game, 3, far2), null);
  assert.equal(game.phase, 'reveal');

  assert.equal(chebyshev(near(target), target), 1);
  assert.equal(chebyshev(far1, target), 5);
  assert.equal(chebyshev(far2, target), 2);
  assert.deepEqual(
    gameView(game, 2).points,
    [
      { id: 1, points: 4 },
      { id: 2, points: 5 },
      { id: 3, points: 1 },
    ],
  );
  assert.equal(gameView(game, 3).target, target);
  assert.equal(gameView(game, 3).scores.find((entry) => entry.id === 2)?.score, 5);
});

test('the last round advances to final standings', () => {
  const game = startGame(players.slice(0, 2), 1);
  const target = game.candidates[0];
  assert.equal(submitCue1(game, 1, target, 'sunset'), null);
  assert.equal(submitPlacement(game, 2, target), null);
  assert.equal(game.phase, 'cue2');
  assert.equal(submitCue2(game, 1, 'warm sand'), null);
  assert.equal(submitPlacement(game, 2, near(target)), null);
  assert.equal(game.phase, 'reveal');
  nextRound(game);
  assert.equal(game.phase, 'cue1');
  assert.equal(game.giverId, 2);

  const second = game.candidates[0];
  assert.equal(submitCue1(game, 2, second, 'ocean'), null);
  assert.equal(submitPlacement(game, 1, second), null);
  assert.equal(submitCue2(game, 2, 'deep water'), null);
  assert.equal(submitPlacement(game, 1, near(second)), null);
  assert.equal(game.phase, 'reveal');
  nextRound(game);
  assert.equal(game.phase, 'final');
  assert.equal(gameView(game, 1).target, second);
});

test('giver leaving aborts the round to the next player', () => {
  const game = startGame(players, 1);
  assert.equal(syncGame(game, players.slice(1), 1), true);
  assert.deepEqual(game.order, [2, 3]);
  assert.equal(game.round, 0);
  assert.equal(game.giverId, 2);
  assert.equal(game.phase, 'cue1');
  assert.equal(game.target, null);
});

test('guesser leaving can complete the current placement wave', () => {
  const game = startGame(players, 1);
  const target = game.candidates[0];
  assert.equal(submitCue1(game, 1, target, 'sunset'), null);
  assert.equal(submitPlacement(game, 2, target), null);
  assert.equal(game.phase, 'place1');
  assert.equal(syncGame(game, players.slice(0, 2), 3), true);
  assert.equal(game.phase, 'cue2');
  assert.deepEqual(game.order, [1, 2]);
});

test('a game drops when fewer than two players remain', () => {
  const game = startGame(players, 1);
  assert.equal(syncGame(game, players.slice(0, 1), 2), false);
  assert.equal(syncGame(game, players.slice(0, 1), 3), false);
});

test('hidden first pawns stay out of every view until the wave ends', () => {
  const game = startGame(players, 1, {
    ...DEFAULT_SETTINGS,
    hideFirstPawns: true,
    grayPawns: true,
  });
  const target = game.candidates[0];
  assert.equal(submitCue1(game, 1, target, 'sunset'), null);
  assert.equal(submitPlacement(game, 2, target), null);

  assert.deepEqual(gameView(game, 1).placements, []);
  assert.deepEqual(gameView(game, 2).placements, []);
  assert.deepEqual(gameView(game, 3).placements, []);
  assert.equal(gameView(game, 2).youPlaced, true);

  assert.equal(submitPlacement(game, 3, farther(target, 4)), null);
  assert.equal(game.phase, 'cue2');
  assert.equal(gameView(game, 1).placements.length, 2);
});

test('guessers can vote for a second cue after pawn 1', () => {
  const game = startGame(players, 1, { ...DEFAULT_SETTINGS, voteSecondCue: true });
  const target = game.candidates[0];
  assert.equal(submitCue1(game, 1, target, 'sunset'), null);
  assert.equal(submitPlacement(game, 2, target), null);
  assert.equal(submitPlacement(game, 3, farther(target, 4)), null);
  assert.equal(game.phase, 'vote');
  assert.deepEqual(gameView(game, 1).waitingOn, [2, 3]);

  assert.match(submitVote(game, 1, true) ?? '', /giver/);
  assert.match(submitVote(game, 2, 'yes') ?? '', /yes or no/i);
  assert.equal(submitVote(game, 2, true), null);
  assert.equal(game.phase, 'vote');
  assert.equal(gameView(game, 3).youVoted, false);
  assert.equal(submitVote(game, 3, true), null);
  assert.equal(game.phase, 'cue2');
});

test('a split second-cue vote ends the round after the first pawns', () => {
  const game = startGame(players, 1, { ...DEFAULT_SETTINGS, voteSecondCue: true });
  const target = game.candidates[0];
  assert.equal(submitCue1(game, 1, target, 'sunset'), null);
  assert.equal(submitPlacement(game, 2, target), null);
  assert.equal(submitPlacement(game, 3, farther(target, 5)), null);
  assert.equal(game.phase, 'vote');

  assert.equal(submitVote(game, 2, true), null);
  assert.equal(submitVote(game, 3, false), null);
  assert.equal(game.phase, 'reveal');
  assert.deepEqual(
    gameView(game, 1).points,
    [
      { id: 1, points: 2 },
      { id: 2, points: 3 },
      { id: 3, points: 0 },
    ],
  );
});

test('one cue ends the round after the first pawns', () => {
  const game = startGame(players, 1, { ...DEFAULT_SETTINGS, oneCue: true });
  const target = game.candidates[0];
  assert.equal(submitCue1(game, 1, target, 'sunset'), null);
  assert.equal(submitPlacement(game, 2, target), null);
  assert.equal(submitPlacement(game, 3, near(target)), null);
  assert.equal(game.phase, 'reveal');
  assert.deepEqual(
    gameView(game, 1).points,
    [
      { id: 1, points: 4 },
      { id: 2, points: 3 },
      { id: 3, points: 2 },
    ],
  );
});

test('two laps double the rounds and bring the first giver back', () => {
  const game = startGame(players, 1, { ...DEFAULT_SETTINGS, twoLaps: true });
  assert.equal(gameView(game, 1).totalRounds, 6);
  game.phase = 'reveal';
  game.round = 2;
  nextRound(game);
  assert.equal(game.round, 3);
  assert.equal(game.giverId, 1);
  game.phase = 'reveal';
  game.round = 5;
  nextRound(game);
  assert.equal(game.phase, 'final');
});

test('the chosen first giver starts, then round-robin follows the player list', () => {
  const game = startGame(players, 2);
  assert.equal(game.giverId, 2);
  assert.deepEqual(game.order, [2, 1, 3]);
  game.phase = 'reveal';
  nextRound(game);
  assert.equal(game.giverId, 1);
});

test('a null first giver picks a random player from the list', () => {
  for (let attempt = 0; attempt < 25; attempt++) {
    const game = startGame(players, null);
    assert.deepEqual([...game.order].sort(), [1, 2, 3]);
    assert.equal(game.giverId, game.order[0]);
  }
});

test('shuffled givers keep the chosen first and mix the rest', () => {
  const game = startGame(players, 3, { ...DEFAULT_SETTINGS, shuffledGivers: true });
  assert.equal(game.order[0], 3);
  assert.deepEqual([...game.order].sort(), [1, 2, 3]);
});

test('spectators see the round but cannot act in it', () => {
  const game = startGame(players, 1);
  const view = gameView(game, 99);
  assert.equal(view.inGame, false);
  assert.equal(view.candidates, null);
  assert.equal(view.target, null);
  assert.equal(gameView(game, 2).inGame, true);
  assert.equal(
    submitCue1(game, 99, game.candidates[0], 'sunset'),
    'Only the cue giver can give the cue.',
  );
  assert.equal(submitCue1(game, 1, game.candidates[0], 'sunset'), null);
  assert.match(submitPlacement(game, 99, 0) ?? '', /not in this game/);
  assert.equal(submitPlacement(game, 2, 0), null);
});

test('normalizeSettings keeps anonymous pawns tied to hidden pawns', () => {
  assert.deepEqual(normalizeSettings({ grayPawns: true }), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ hideFirstPawns: true, grayPawns: true }), {
    ...DEFAULT_SETTINGS,
    hideFirstPawns: true,
    grayPawns: true,
  });
  assert.deepEqual(
    normalizeSettings({ oneCue: true, voteSecondCue: true, twoLaps: true, hideScores: true }),
    { ...DEFAULT_SETTINGS, oneCue: true, twoLaps: true, hideScores: true },
  );
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
});
