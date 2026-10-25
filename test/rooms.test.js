import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_PLAYERS,
  activePlayers,
  addPlayer,
  createRoom,
  removePlayer,
  roomView,
  setColor,
  setSpectator,
} from '../server/rooms.ts';
import { DEFAULT_SETTINGS } from '../src/game.ts';

test('rooms cap at 8, reuse a freed slot, and pass host on leave', () => {
  const rooms = new Map();
  const room = createRoom(rooms);
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(rooms.get(room.code), room);

  const players = [];
  for (let i = 0; i < MAX_PLAYERS; i++) players.push(addPlayer(room, `P${i}`));
  assert.deepEqual(
    players.map((player) => player.slot),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.deepEqual(
    players.map((player) => player.color),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(addPlayer(room, 'Ninth'), null);
  assert.equal(room.hostId, players[0].id);

  assert.equal(removePlayer(room, players[0].id), true);
  assert.equal(room.hostId, players[1].id);
  const replacement = addPlayer(room, 'New');
  assert.equal(replacement.slot, 0);
  assert.equal(replacement.color, 0);
  assert.equal(room.players.length, MAX_PLAYERS);
  assert.equal(removePlayer(room, 999), false);
});

test('spectators stay in the room but out of the active list', () => {
  const room = createRoom(new Map());
  const a = addPlayer(room, 'Ava');
  const b = addPlayer(room, 'Ben');
  const c = addPlayer(room, 'Cara', true);
  assert.equal(c.spectator, true);
  assert.deepEqual(
    activePlayers(room).map((player) => player.name),
    ['Ava', 'Ben'],
  );

  room.firstGiver = b.id;
  setSpectator(room, b.id, true);
  assert.equal(room.firstGiver, null);
  assert.equal(activePlayers(room).length, 1);
  setSpectator(room, b.id, false);
  assert.equal(activePlayers(room).length, 2);
  assert.equal(setSpectator(room, 999, true), null);
  assert.equal(a.spectator, false);
});

test('players pick a free color and cannot share one', () => {
  const room = createRoom(new Map());
  const a = addPlayer(room, 'Ava');
  const b = addPlayer(room, 'Ben');
  assert.equal(setColor(room, b.id, a.color), 'Someone already has that color.');
  assert.equal(setColor(room, b.id, 99), 'Pick a color.');
  assert.equal(setColor(room, b.id, 1.5), 'Pick a color.');
  assert.equal(setColor(room, 999, 2), 'You are not in this room.');
  assert.equal(setColor(room, b.id, 5), null);
  assert.equal(b.color, 5);
});

test('leaving clears a stale first-giver pick', () => {
  const room = createRoom(new Map());
  const a = addPlayer(room, 'Ava');
  addPlayer(room, 'Ben');
  room.firstGiver = a.id;
  removePlayer(room, a.id);
  assert.equal(room.firstGiver, null);
});

test('room snapshots expose only public fields', () => {
  const room = createRoom(new Map());
  addPlayer(room, 'Ava');
  const view = roomView(room);
  assert.deepEqual(Object.keys(view).sort(), [
    'chat',
    'code',
    'firstGiver',
    'hostId',
    'players',
    'settings',
  ]);
  assert.equal(view.firstGiver, null);
  assert.deepEqual(Object.keys(view.players[0]).sort(), [
    'color',
    'id',
    'name',
    'slot',
    'spectator',
  ]);
  assert.deepEqual(view.settings, DEFAULT_SETTINGS);
  assert.deepEqual(view.chat, []);
});
