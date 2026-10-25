import { translate, type Lang } from './i18n.ts';

export const COLS = 24;
export const ROWS = 20;
export const CELLS = COLS * ROWS;

export type Player = { id: number; name: string; color: string };
export type Placement = { playerId: number; pawn: 1 | 2; cell: number };

export const PLAYER_COLORS = [
  '#f43f5e',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

export const PAWN_HIDDEN_COLOR = '#98a1b3';
export const CHAT_MAX = 160;

export type Settings = {
  hideFirstPawns: boolean;
  grayPawns: boolean;
  voteSecondCue: boolean;
  oneCue: boolean;
  twoLaps: boolean;
  hideScores: boolean;
  shuffledGivers: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  hideFirstPawns: false,
  grayPawns: false,
  voteSecondCue: false,
  oneCue: false,
  twoLaps: false,
  hideScores: false,
  shuffledGivers: false,
};

export function normalizeSettings(value: unknown): Settings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<
    Record<keyof Settings, unknown>
  >;
  const hideFirstPawns = raw.hideFirstPawns === true;
  const oneCue = raw.oneCue === true;
  return {
    hideFirstPawns,
    grayPawns: hideFirstPawns && raw.grayPawns === true,
    voteSecondCue: !oneCue && raw.voteSecondCue === true,
    oneCue,
    twoLaps: raw.twoLaps === true,
    hideScores: raw.hideScores === true,
    shuffledGivers: raw.shuffledGivers === true,
  };
}

export function matchRounds(playerCount: number, settings: Settings): number {
  return playerCount * (settings.twoLaps ? 2 : 1);
}

function paletteEntry(col: number, row: number) {
  const t = row / (ROWS - 1);
  // Hue span stays under 360° (max ~341°) so the left edge reads red/orange
  // and the right edge violet/pink — never a near-copy across the seam.
  const hue = col * 13 + row * 2.2;
  const light = 0.92 - 0.56 * Math.pow(t, 0.85);
  const chroma = 0.1 + 0.11 * Math.sin(Math.PI * t);
  return {
    oklch: `oklch(${light.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`,
    hsl: `hsl(${hue.toFixed(0)}, ${Math.min(100, chroma * 430 + 8).toFixed(0)}%, ${(light * 100).toFixed(0)}%)`,
  };
}

// Precomputed because the board renders all 480 cells at once.
export const PALETTE = Array.from({ length: CELLS }, (_, i) =>
  paletteEntry(i % COLS, Math.floor(i / COLS)),
);

export function chebyshev(a: number, b: number): number {
  const dx = Math.abs((a % COLS) - (b % COLS));
  const dy = Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS));
  return Math.max(dx, dy);
}

export function pawnPoints(distance: number): number {
  if (distance === 0) return 3;
  if (distance === 1) return 2;
  if (distance === 2) return 1;
  return 0;
}

export function placementPoints(
  placement: Placement,
  giverId: number,
  target: number,
  playerCount: number,
): number {
  const distance = chebyshev(placement.cell, target);
  if (placement.playerId === giverId) {
    return distance <= 1 ? (playerCount === 3 ? 2 : 1) : 0;
  }
  return pawnPoints(distance);
}

export function scoreRound(
  giverId: number,
  target: number,
  placements: Placement[],
  playerCount: number,
): number[] {
  const points = Array<number>(playerCount).fill(0);
  for (const placement of placements) {
    points[placement.playerId] += placementPoints(placement, giverId, target, playerCount);
  }
  return points;
}

const COLOR_WORDS = new Set([
  'beige',
  'black',
  'blue',
  'brown',
  'charcoal',
  'coral',
  'cream',
  'crimson',
  'cyan',
  'gold',
  'gray',
  'green',
  'grey',
  'indigo',
  'ivory',
  'lavender',
  'lilac',
  'magenta',
  'maroon',
  'mint',
  'navy',
  'olive',
  'orange',
  'peach',
  'pink',
  'plum',
  'purple',
  'red',
  'salmon',
  'silver',
  'tan',
  'teal',
  'turquoise',
  'violet',
  'white',
  'yellow',
]);

// Vietnamese color names. ponytail: only diacritic forms are matched — typing
// "do"/"vang" without diacritics slips through, add a fold-and-check pass if
// that becomes a problem in playtests.
const COLOR_WORDS_VI = new Set([
  'bạc',
  'cam',
  'đen',
  'đỏ',
  'hồng',
  'lam',
  'nâu',
  'tía',
  'tím',
  'trắng',
  'vàng',
  'xám',
  'xanh',
]);

export function cueError(text: string, maxWords: number, lang: Lang = 'en'): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return translate(lang, 'cueError.empty');
  if (maxWords === 1 ? words.length !== 1 : words.length > maxWords) {
    return translate(lang, maxWords === 1 ? 'cueError.cue1Words' : 'cueError.cue2Words');
  }
  for (const raw of words) {
    const lowered = raw.toLowerCase();
    const letters = lowered.replace(/[\p{P}\p{S}]/gu, '');
    if (
      COLOR_WORDS_VI.has(letters) ||
      COLOR_WORDS.has(letters.replace(/[^a-z]/g, ''))
    ) {
      return translate(lang, 'cueError.colorName', { word: raw });
    }
    const token = lowered.replace(/[^a-z0-9]/g, '');
    if (/^[a-z]\d+$|^\d+[a-z]$|^\d+$/.test(token)) return translate(lang, 'cueError.coordinate');
  }
  return null;
}

export function pickCandidates(count = 4, minGap = 3): number[] {
  const cells: number[] = [];
  for (let attempt = 0; attempt < 500 && cells.length < count; attempt++) {
    const cell = Math.floor(Math.random() * CELLS);
    if (cells.every((other) => chebyshev(other, cell) >= minGap)) cells.push(cell);
  }
  while (cells.length < count) {
    const cell = Math.floor(Math.random() * CELLS);
    if (!cells.includes(cell)) cells.push(cell);
  }
  return cells;
}

export function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// firstId null (or not in ids) means a random first giver; the rest follow the
// player list order, or a shuffle when the shuffled-givers rule is on.
export function buildOrder(ids: number[], firstId: number | null, shuffledGivers: boolean): number[] {
  if (ids.length === 0) return [];
  const first =
    firstId != null && ids.includes(firstId) ? firstId : ids[Math.floor(Math.random() * ids.length)];
  const rest = ids.filter((id) => id !== first);
  return [first, ...(shuffledGivers ? shuffled(rest) : rest)];
}

export function guessersFor(order: number[], round: number): number[] {
  if (order.length === 0) return [];
  const index = round % order.length;
  return [...order.slice(index + 1), ...order.slice(0, index)];
}
