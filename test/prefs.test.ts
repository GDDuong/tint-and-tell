import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, isPttKey, isSpeechFrame, loadPrefs } from '../src/prefs.ts';

test('loadPrefs falls back to defaults and clamps stored values', () => {
  const original = globalThis.localStorage;
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };

  assert.deepEqual(loadPrefs(), DEFAULT_PREFS);

  store.set(
    'tint-prefs',
    JSON.stringify({
      theme: 'light',
      voiceMode: 'ptt',
      micSensitivity: 400,
      micBoost: -5,
      masterVol: 'abc',
      pttKey: 'KeyT',
      playerVols: { Mai: 40 },
    }),
  );
  const prefs = loadPrefs();
  assert.equal(prefs.theme, 'light');
  assert.equal(prefs.voiceMode, 'ptt');
  assert.equal(prefs.micSensitivity, 100);
  assert.equal(prefs.micBoost, 0);
  assert.equal(prefs.masterVol, 100);
  assert.equal(prefs.pttKey, 'KeyT');
  assert.deepEqual(prefs.playerVols, { Mai: 40 });

  (globalThis as Record<string, unknown>).localStorage = original;
});

test('VAD cutoff scales with sensitivity', () => {
  assert.equal(isSpeechFrame(127, 0), false);
  assert.equal(isSpeechFrame(127, 100), true);
  assert.equal(isSpeechFrame(6, 100), true);
  assert.equal(isSpeechFrame(5, 100), false);
  assert.equal(isSpeechFrame(0, 100), false);
  assert.equal(isSpeechFrame(120, 50), true);
  assert.equal(isSpeechFrame(30, 50), false);
});

test('PTT keybind matches KeyboardEvent.code only when set', () => {
  assert.equal(isPttKey({ code: 'Space' }, 'Space'), true);
  assert.equal(isPttKey({ code: 'Space' }, 'KeyT'), false);
  assert.equal(isPttKey({ code: 'Space' }, ''), false);
});
