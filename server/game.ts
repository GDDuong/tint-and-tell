import {
  CELLS,
  DEFAULT_SETTINGS,
  buildOrder,
  chebyshev,
  cueError,
  matchRounds,
  normalizeSettings,
  pawnPoints,
  pickCandidates,
  type Settings,
} from '../src/game.ts';

export type GamePhase = 'cue1' | 'place1' | 'vote' | 'cue2' | 'place2' | 'reveal' | 'final';
export type GamePlacement = { playerId: number; pawn: 1 | 2; cell: number };

export type Game = {
  phase: GamePhase;
  order: number[];
  round: number;
  giverId: number;
  candidates: number[];
  target: number | null;
  cue1: string;
  cue2: string;
  placements: GamePlacement[];
  scores: Map<number, number>;
  points: Map<number, number>;
  settings: Settings;
  votes: Map<number, boolean>;
};

export type GameView = {
  phase: GamePhase;
  round: number;
  totalRounds: number;
  giverId: number;
  cue1: string;
  cue2: string;
  target: number | null;
  candidates: number[] | null;
  placements: GamePlacement[];
  scores: { id: number; score: number }[];
  points: { id: number; points: number }[] | null;
  waitingOn: number[];
  youPlaced: boolean;
  youVoted: boolean;
  inGame: boolean;
  settings: Settings;
};

type GamePlayer = { id: number };

const MAX_CUE = 40;

function cleanCue(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CUE);
}

function guessers(game: Game): number[] {
  return game.order.filter((id) => id !== game.giverId);
}

function hasPlaced(game: Game, playerId: number, pawn: 1 | 2): boolean {
  return game.placements.some(
    (placement) => placement.playerId === playerId && placement.pawn === pawn,
  );
}

function waveComplete(game: Game, pawn: 1 | 2): boolean {
  const players = guessers(game);
  return players.length > 0 && players.every((id) => hasPlaced(game, id, pawn));
}

function beginRound(game: Game) {
  game.phase = 'cue1';
  game.giverId = game.order[game.round % game.order.length];
  game.candidates = pickCandidates();
  game.target = null;
  game.cue1 = '';
  game.cue2 = '';
  game.placements = [];
  game.points = new Map();
  game.votes.clear();
}

function afterFirstPawns(game: Game) {
  game.votes.clear();
  if (game.settings.oneCue) {
    finishRound(game);
    return;
  }
  game.phase = game.settings.voteSecondCue ? 'vote' : 'cue2';
}

export function startGame(
  players: GamePlayer[],
  firstGiverId: number | null = null,
  settings: Settings = DEFAULT_SETTINGS,
): Game {
  const normalized = normalizeSettings(settings);
  const order = buildOrder(
    players.map((player) => player.id),
    firstGiverId,
    normalized.shuffledGivers,
  );
  const game: Game = {
    phase: 'cue1',
    order,
    round: 0,
    giverId: order[0],
    candidates: pickCandidates(),
    target: null,
    cue1: '',
    cue2: '',
    placements: [],
    scores: new Map(players.map((player) => [player.id, 0])),
    points: new Map(),
    settings: normalized,
    votes: new Map(),
  };
  return game;
}

export function submitCue1(
  game: Game,
  playerId: number,
  target: unknown,
  cue: unknown,
): string | null {
  if (game.phase !== 'cue1') return 'Not time for cue 1.';
  if (playerId !== game.giverId) return 'Only the cue giver can give the cue.';
  const cell = Number(target);
  if (!Number.isInteger(cell) || !game.candidates.includes(cell)) {
    return 'Pick one of the framed squares.';
  }
  const text = cleanCue(cue);
  const error = cueError(text, 1);
  if (error) return error;
  game.target = cell;
  game.cue1 = text;
  game.phase = 'place1';
  return null;
}

export function submitPlacement(game: Game, playerId: number, cell: unknown): string | null {
  const pawn = game.phase === 'place1' ? 1 : game.phase === 'place2' ? 2 : null;
  if (pawn == null) return 'Not time to place a pawn.';
  if (playerId === game.giverId) return 'The cue giver does not place pawns.';
  if (!game.order.includes(playerId)) return 'You are not in this game.';
  if (!Number.isInteger(cell) || (cell as number) < 0 || (cell as number) >= CELLS) {
    return 'Pick a square on the board.';
  }
  if (hasPlaced(game, playerId, pawn)) return 'Pawn already placed.';
  game.placements.push({ playerId, pawn, cell: cell as number });
  if (pawn === 1) {
    if (waveComplete(game, 1)) afterFirstPawns(game);
  } else if (waveComplete(game, 2)) {
    finishRound(game);
  }
  return null;
}

export function submitVote(game: Game, playerId: number, yes: unknown): string | null {
  if (game.phase !== 'vote') return 'Not time to vote.';
  if (playerId === game.giverId) return 'The cue giver does not vote.';
  if (!game.order.includes(playerId)) return 'You are not in this game.';
  if (typeof yes !== 'boolean') return 'Vote yes or no.';
  if (game.votes.has(playerId)) return 'Vote already cast.';
  game.votes.set(playerId, yes);
  if (guessers(game).every((id) => game.votes.has(id))) resolveVote(game);
  return null;
}

function resolveVote(game: Game) {
  const total = guessers(game).length;
  const yes = [...game.votes.values()].filter(Boolean).length;
  if (yes * 2 > total) {
    game.phase = 'cue2';
    return;
  }
  finishRound(game);
}

export function submitCue2(game: Game, playerId: number, cue: unknown): string | null {
  if (game.phase !== 'cue2') return 'Not time for cue 2.';
  if (playerId !== game.giverId) return 'Only the cue giver can give the cue.';
  const text = cleanCue(cue);
  const error = cueError(text, 2);
  if (error) return error;
  game.cue2 = text;
  game.phase = 'place2';
  return null;
}

function finishRound(game: Game) {
  const target = game.target;
  if (target == null) return;
  const perPawn = game.order.length === 3 ? 2 : 1;
  const points = new Map<number, number>(game.order.map((id) => [id, 0]));
  let inFrame = 0;
  for (const placement of game.placements) {
    if (placement.playerId === game.giverId) continue;
    const distance = chebyshev(placement.cell, target);
    if (distance <= 1) inFrame += 1;
    points.set(
      placement.playerId,
      (points.get(placement.playerId) ?? 0) + pawnPoints(distance),
    );
  }
  points.set(game.giverId, (points.get(game.giverId) ?? 0) + inFrame * perPawn);
  for (const [id, value] of points) game.scores.set(id, (game.scores.get(id) ?? 0) + value);
  game.points = points;
  game.phase = 'reveal';
}

export function nextRound(game: Game) {
  if (game.phase !== 'reveal') return;
  if (game.round + 1 >= matchRounds(game.order.length, game.settings)) {
    game.phase = 'final';
    return;
  }
  game.round += 1;
  beginRound(game);
}

export function gameView(game: Game, viewerId: number): GameView {
  const revealed = game.phase === 'reveal' || game.phase === 'final';
  const pawn = game.phase === 'place1' ? 1 : game.phase === 'place2' ? 2 : null;
  const hidePlacements = game.settings.hideFirstPawns && game.phase === 'place1';
  const waitingOn =
    game.phase === 'vote'
      ? guessers(game).filter((id) => !game.votes.has(id))
      : pawn == null
        ? []
        : guessers(game).filter((id) => !hasPlaced(game, id, pawn));
  return {
    phase: game.phase,
    round: game.round,
    totalRounds: matchRounds(game.order.length, game.settings),
    giverId: game.giverId,
    cue1: game.cue1,
    cue2: game.cue2,
    target: viewerId === game.giverId || revealed ? game.target : null,
    candidates:
      viewerId === game.giverId && game.phase === 'cue1' ? game.candidates : null,
    placements: hidePlacements ? [] : game.placements,
    scores: game.order.map((id) => ({ id, score: game.scores.get(id) ?? 0 })),
    points: revealed
      ? game.order.map((id) => ({ id, points: game.points.get(id) ?? 0 }))
      : null,
    waitingOn,
    youPlaced: pawn != null && hasPlaced(game, viewerId, pawn),
    youVoted: game.phase === 'vote' && game.votes.has(viewerId),
    inGame: game.order.includes(viewerId),
    settings: game.settings,
  };
}

export function syncGame(game: Game, players: GamePlayer[], departedId: number): boolean {
  const present = new Set(players.map((player) => player.id));
  const giverLeft = !present.has(game.giverId);
  game.order = game.order.filter((id) => present.has(id));
  game.placements = game.placements.filter((placement) => present.has(placement.playerId));
  game.scores.delete(departedId);
  game.points.delete(departedId);
  for (const id of game.votes.keys()) {
    if (!present.has(id)) game.votes.delete(id);
  }
  for (const player of players) {
    if (!game.scores.has(player.id)) game.scores.set(player.id, 0);
  }
  if (game.order.length < 2) return false;

  if (giverLeft && game.phase !== 'reveal' && game.phase !== 'final') {
    game.round = Math.min(game.round, matchRounds(game.order.length, game.settings) - 1);
    beginRound(game);
    return true;
  }
  if (game.phase === 'place1' && waveComplete(game, 1)) afterFirstPawns(game);
  if (game.phase === 'place2' && waveComplete(game, 2)) finishRound(game);
  if (game.phase === 'vote' && guessers(game).every((id) => game.votes.has(id))) {
    resolveVote(game);
  }
  return true;
}
