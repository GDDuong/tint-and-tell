import { CHAT_MAX } from '../src/game.ts';

// oxlint-disable-next-line no-control-regex -- strip control characters from chat
const UNSAFE = /[<>\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g;

export function cleanChat(value: unknown): string {
  return String(value ?? '')
    .replace(UNSAFE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX);
}
