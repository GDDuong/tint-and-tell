import { DEFAULT_SETTINGS, PLAYER_COLORS, type Settings } from '../src/game.ts';
import type { Game } from './game.ts';

export const MAX_PLAYERS = 8;
export const CHAT_HISTORY = 30;

export type RoomPlayer = {
  id: number;
  slot: number;
  name: string;
  color: number;
  spectator: boolean;
};
export type ChatMessage = { id: number; playerId: number; name: string; text: string };
export type Room = {
  code: string;
  hostId: number;
  nextId: number;
  players: RoomPlayer[];
  game: Game | null;
  settings: Settings;
  firstGiver: number | null;
  chat: ChatMessage[];
  nextChatId: number;
};
export type RoomView = {
  code: string;
  hostId: number;
  players: RoomPlayer[];
  settings: Settings;
  firstGiver: number | null;
  chat: ChatMessage[];
};

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(rooms: Map<string, Room>): string {
  let code = '';
  do {
    code = Array.from(
      { length: 4 },
      () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
    ).join('');
  } while (rooms.has(code));
  return code;
}

export function createRoom(rooms: Map<string, Room>): Room {
  const room: Room = {
    code: newCode(rooms),
    hostId: 0,
    nextId: 1,
    players: [],
    game: null,
    settings: { ...DEFAULT_SETTINGS },
    firstGiver: null,
    chat: [],
    nextChatId: 1,
  };
  rooms.set(room.code, room);
  return room;
}

export function addPlayer(room: Room, name: string, spectator = false): RoomPlayer | null {
  if (room.players.length >= MAX_PLAYERS) return null;
  const used = new Set(room.players.map((player) => player.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  const colors = new Set(room.players.map((player) => player.color));
  let color = 0;
  while (colors.has(color)) color++;
  const player: RoomPlayer = { id: room.nextId++, slot, name, color, spectator };
  room.players.push(player);
  if (room.hostId === 0) room.hostId = player.id;
  return player;
}

export function removePlayer(room: Room, playerId: number): boolean {
  const index = room.players.findIndex((player) => player.id === playerId);
  if (index === -1) return false;
  room.players.splice(index, 1);
  if (room.hostId === playerId) room.hostId = room.players[0]?.id ?? 0;
  if (room.firstGiver === playerId) room.firstGiver = null;
  return true;
}

export function activePlayers(room: Room): RoomPlayer[] {
  return room.players.filter((player) => !player.spectator);
}

export function setSpectator(room: Room, playerId: number, spectator: boolean): RoomPlayer | null {
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) return null;
  player.spectator = spectator;
  if (spectator && room.firstGiver === playerId) room.firstGiver = null;
  return player;
}

export function setColor(room: Room, playerId: number, color: number): string | null {
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) return 'You are not in this room.';
  if (!Number.isInteger(color) || color < 0 || color >= PLAYER_COLORS.length) {
    return 'Pick a color.';
  }
  if (room.players.some((entry) => entry.id !== playerId && entry.color === color)) {
    return 'Someone already has that color.';
  }
  player.color = color;
  return null;
}

export function addChat(room: Room, player: RoomPlayer, text: string): ChatMessage {
  const message: ChatMessage = {
    id: room.nextChatId++,
    playerId: player.id,
    name: player.name,
    text,
  };
  room.chat.push(message);
  if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
  return message;
}

export function roomView(room: Room): RoomView {
  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map(({ id, slot, name, color, spectator }) => ({
      id,
      slot,
      name,
      color,
      spectator,
    })),
    settings: { ...room.settings },
    firstGiver: room.firstGiver,
    chat: room.chat,
  };
}
