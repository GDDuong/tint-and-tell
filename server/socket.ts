import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { normalizeSettings } from '../src/game.ts';
import {
  activePlayers,
  addChat,
  addPlayer,
  createRoom,
  removePlayer,
  roomView,
  setColor,
  setSpectator,
  type Room,
  type RoomView,
} from './rooms.ts';
import {
  gameView,
  nextRound,
  startGame,
  submitCue1,
  submitCue2,
  submitPlacement,
  submitVote,
  syncGame,
} from './game.ts';
import { cleanChat } from './chat.ts';

type Reply = { ok: true; youId: number; room: RoomView } | { ok: false; error: string };
type GameReply = { ok: true } | { ok: false; error: string };

function cleanName(value: unknown): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex -- strip control characters from user names
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 16);
}

function reply(ack: unknown, value: Reply) {
  if (typeof ack === 'function') (ack as (value: Reply) => void)(value);
}

function gameReply(ack: unknown, value: GameReply) {
  if (typeof ack === 'function') (ack as (value: GameReply) => void)(value);
}

export function attachGameServer(httpServer: HttpServer) {
  const io = new Server(httpServer, { serveClient: false });
  const rooms = new Map<string, Room>();

  io.on('connection', (socket) => {
    const currentRoom = (): Room | undefined => {
      const code = socket.data.room as string | undefined;
      return code ? rooms.get(code) : undefined;
    };

    const sendState = (room: Room) => {
      for (const client of io.sockets.sockets.values()) {
        if (client.data.room !== room.code) continue;
        client.emit('room:state', roomView(room));
        const youId = client.data.playerId as number;
        client.emit('game:state', room.game ? gameView(room.game, youId) : null);
      }
    };

    const memberSocket = (code: string, playerId: number): Socket | undefined => {
      for (const client of io.sockets.sockets.values()) {
        if (client.data.room === code && client.data.playerId === playerId) return client;
      }
      return undefined;
    };

    const dropClient = (client: Socket, room: Room) => {
      void client.leave(room.code);
      delete client.data.room;
      delete client.data.playerId;
      delete client.data.lastChatAt;
    };

    const detach = (room: Room, playerId: number) => {
      removePlayer(room, playerId);
      if (room.game && !syncGame(room.game, activePlayers(room), playerId)) room.game = null;
      if (room.players.length === 0) rooms.delete(room.code);
      else sendState(room);
    };

    const leaveRoom = (nextHostId?: number) => {
      const room = currentRoom();
      if (!room) return;
      const playerId = socket.data.playerId as number;
      if (room.hostId === playerId && nextHostId != null) {
        const heir = room.players.find(
          (player) => player.id === nextHostId && player.id !== playerId,
        );
        if (heir) room.hostId = nextHostId;
      }
      dropClient(socket, room);
      detach(room, playerId);
    };

    const seat = (room: Room, name: string, ack: unknown, spectator = false) => {
      const player = addPlayer(room, name, spectator);
      if (!player) {
        reply(ack, { ok: false, error: 'That room is full.' });
        return;
      }
      socket.data.room = room.code;
      socket.data.playerId = player.id;
      void socket.join(room.code);
      reply(ack, { ok: true, youId: player.id, room: roomView(room) });
      sendState(room);
    };

    socket.on('room:create', (payload: { name?: unknown } | undefined, ack: unknown) => {
      if (currentRoom()) return reply(ack, { ok: false, error: 'You are already in a room.' });
      const name = cleanName(payload?.name);
      if (!name) return reply(ack, { ok: false, error: 'Enter your name first.' });
      seat(createRoom(rooms), name, ack);
    });

    socket.on('room:join', (payload: { code?: unknown; name?: unknown } | undefined, ack: unknown) => {
      if (currentRoom()) return reply(ack, { ok: false, error: 'You are already in a room.' });
      const name = cleanName(payload?.name);
      if (!name) return reply(ack, { ok: false, error: 'Enter your name first.' });
      const code = String(payload?.code ?? '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return reply(ack, { ok: false, error: 'No room with that code.' });
      seat(room, name, ack, room.game != null);
    });

    socket.on('room:leave', (payload: { nextHostId?: unknown } | undefined) => {
      const id = Number(payload?.nextHostId);
      leaveRoom(Number.isInteger(id) ? id : undefined);
    });
    socket.on('disconnect', () => leaveRoom());

    socket.on('room:kick', (payload: { playerId?: unknown } | undefined, ack: unknown) => {
      const room = currentRoom();
      if (!room) return gameReply(ack, { ok: false, error: 'Join a room first.' });
      if (room.hostId !== socket.data.playerId) {
        return gameReply(ack, { ok: false, error: 'Only the host can kick players.' });
      }
      const id = Number(payload?.playerId);
      const target = room.players.find(
        (player) => player.id === id && player.id !== socket.data.playerId,
      );
      if (!target) return gameReply(ack, { ok: false, error: 'Pick another player to kick.' });
      const client = memberSocket(room.code, id);
      if (client) {
        client.emit('room:kicked');
        dropClient(client, room);
      }
      gameReply(ack, { ok: true });
      detach(room, id);
    });

    socket.on('room:disband', (ack: unknown) => {
      const room = currentRoom();
      if (!room) return gameReply(ack, { ok: false, error: 'Join a room first.' });
      if (room.hostId !== socket.data.playerId) {
        return gameReply(ack, { ok: false, error: 'Only the host can disband the room.' });
      }
      for (const client of io.sockets.sockets.values()) {
        if (client.data.room !== room.code) continue;
        client.emit('room:closed');
        dropClient(client, room);
      }
      rooms.delete(room.code);
      gameReply(ack, { ok: true });
    });

    socket.on('room:spectate', (payload: { spectator?: unknown } | undefined, ack: unknown) => {
      const room = currentRoom();
      if (!room) return gameReply(ack, { ok: false, error: 'Join a room first.' });
      const playerId = socket.data.playerId as number;
      const spectator = payload?.spectator === true;
      if (!spectator && room.game && !room.game.order.includes(playerId)) {
        return gameReply(ack, { ok: false, error: 'Wait for the next game to join in.' });
      }
      setSpectator(room, playerId, spectator);
      if (room.game && !syncGame(room.game, activePlayers(room), playerId)) room.game = null;
      gameReply(ack, { ok: true });
      sendState(room);
    });

    socket.on('room:color', (payload: { color?: unknown } | undefined, ack: unknown) => {
      const room = currentRoom();
      if (!room) return gameReply(ack, { ok: false, error: 'Join a room first.' });
      const error = setColor(room, socket.data.playerId as number, Number(payload?.color));
      if (error) return gameReply(ack, { ok: false, error });
      gameReply(ack, { ok: true });
      sendState(room);
    });

    socket.on('room:settings', (payload: unknown, ack: unknown) => {
      const room = currentRoom();
      if (!room) return gameReply(ack, { ok: false, error: 'Join a room first.' });
      if (room.hostId !== socket.data.playerId) {
        return gameReply(ack, { ok: false, error: 'Only the host can change the rules.' });
      }
      if (room.game) {
        return gameReply(ack, { ok: false, error: 'Rules are locked during a game.' });
      }
      room.settings = normalizeSettings(payload);
      gameReply(ack, { ok: true });
      sendState(room);
    });

    socket.on('chat:send', (payload: { text?: unknown } | undefined, ack: unknown) => {
      const room = currentRoom();
      if (!room) return gameReply(ack, { ok: false, error: 'Join a room first.' });
      const player = room.players.find((entry) => entry.id === socket.data.playerId);
      if (!player) return gameReply(ack, { ok: false, error: 'You are not in this room.' });
      const game = room.game;
      if (
        game &&
        game.giverId === player.id &&
        game.phase !== 'reveal' &&
        game.phase !== 'final'
      ) {
        return gameReply(ack, {
          ok: false,
          error: 'You are the cue giver — chat unlocks at the reveal.',
        });
      }
      const now = Date.now();
      const last = socket.data.lastChatAt as number | undefined;
      if (last && now - last < 700) {
        return gameReply(ack, { ok: false, error: 'Easy — one message at a time.' });
      }
      const text = cleanChat(payload?.text);
      if (!text) return gameReply(ack, { ok: false, error: 'Type a message first.' });
      socket.data.lastChatAt = now;
      addChat(room, player, text);
      gameReply(ack, { ok: true });
      sendState(room);
    });

    socket.on('voice:signal', (payload: { to?: unknown; data?: unknown } | undefined) => {
      const room = currentRoom();
      const to = Number(payload?.to);
      if (!room || !Number.isInteger(to)) return;
      for (const client of io.sockets.sockets.values()) {
        if (client.data.room === room.code && client.data.playerId === to) {
          client.emit('voice:signal', { from: socket.data.playerId, data: payload?.data });
        }
      }
    });

    socket.on('game:start', (ack: unknown) => {
      const room = currentRoom();
      if (!room) return gameReply(ack, { ok: false, error: 'Join a room first.' });
      if (room.hostId !== socket.data.playerId) {
        return gameReply(ack, { ok: false, error: 'Only the host can start the game.' });
      }
      if (room.game) return gameReply(ack, { ok: false, error: 'The game already started.' });
      if (activePlayers(room).length < 2) {
        return gameReply(ack, { ok: false, error: 'Need at least 2 players to start.' });
      }
      room.game = startGame(activePlayers(room), room.firstGiver, room.settings);
      gameReply(ack, { ok: true });
      sendState(room);
    });

    socket.on('room:firstGiver', (payload: { playerId?: unknown } | undefined, ack: unknown) => {
      const room = currentRoom();
      if (!room) return gameReply(ack, { ok: false, error: 'Join a room first.' });
      if (room.hostId !== socket.data.playerId) {
        return gameReply(ack, { ok: false, error: 'Only the host can pick the starting cue giver.' });
      }
      if (room.game) return gameReply(ack, { ok: false, error: 'The game already started.' });
      const id = Number(payload?.playerId);
      room.firstGiver =
        Number.isInteger(id) && activePlayers(room).some((p) => p.id === id) ? id : null;
      gameReply(ack, { ok: true });
      sendState(room);
    });

    socket.on(
      'game:cue1',
      (payload: { target?: unknown; cue?: unknown } | undefined, ack: unknown) => {
        const room = currentRoom();
        if (!room?.game) return gameReply(ack, { ok: false, error: 'No game running.' });
        const error = submitCue1(
          room.game,
          socket.data.playerId as number,
          payload?.target,
          payload?.cue,
        );
        if (error) return gameReply(ack, { ok: false, error });
        gameReply(ack, { ok: true });
        sendState(room);
      },
    );

    socket.on('game:place', (payload: { cell?: unknown } | undefined, ack: unknown) => {
      const room = currentRoom();
      if (!room?.game) return gameReply(ack, { ok: false, error: 'No game running.' });
      const error = submitPlacement(
        room.game,
        socket.data.playerId as number,
        payload?.cell,
      );
      if (error) return gameReply(ack, { ok: false, error });
      gameReply(ack, { ok: true });
      sendState(room);
    });

    socket.on('game:cue2', (payload: { cue?: unknown } | undefined, ack: unknown) => {
      const room = currentRoom();
      if (!room?.game) return gameReply(ack, { ok: false, error: 'No game running.' });
      const error = submitCue2(room.game, socket.data.playerId as number, payload?.cue);
      if (error) return gameReply(ack, { ok: false, error });
      gameReply(ack, { ok: true });
      sendState(room);
    });

    socket.on('game:vote', (payload: { yes?: unknown } | undefined, ack: unknown) => {
      const room = currentRoom();
      if (!room?.game) return gameReply(ack, { ok: false, error: 'No game running.' });
      const error = submitVote(room.game, socket.data.playerId as number, payload?.yes);
      if (error) return gameReply(ack, { ok: false, error });
      gameReply(ack, { ok: true });
      sendState(room);
    });

    socket.on('game:next', (ack: unknown) => {
      const room = currentRoom();
      if (!room?.game) return gameReply(ack, { ok: false, error: 'No game running.' });
      if (room.hostId !== socket.data.playerId) {
        return gameReply(ack, { ok: false, error: 'Only the host can move on.' });
      }
      nextRound(room.game);
      gameReply(ack, { ok: true });
      sendState(room);
    });

    socket.on('game:rematch', (ack: unknown) => {
      const room = currentRoom();
      if (!room?.game) return gameReply(ack, { ok: false, error: 'No game running.' });
      if (room.hostId !== socket.data.playerId) {
        return gameReply(ack, { ok: false, error: 'Only the host can start a rematch.' });
      }
      if (activePlayers(room).length < 2) {
        return gameReply(ack, { ok: false, error: 'Need at least 2 players to start.' });
      }
      room.game = startGame(activePlayers(room), room.firstGiver, room.settings);
      gameReply(ack, { ok: true });
      sendState(room);
    });

    socket.on('game:lobby', (ack: unknown) => {
      const room = currentRoom();
      if (!room?.game) return gameReply(ack, { ok: false, error: 'No game running.' });
      if (room.hostId !== socket.data.playerId) {
        return gameReply(ack, { ok: false, error: 'Only the host can return to the lobby.' });
      }
      room.game = null;
      gameReply(ack, { ok: true });
      sendState(room);
    });
  });

  return io;
}
