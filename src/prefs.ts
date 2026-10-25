// App-level preferences (separate from per-room game rules). Plain localStorage;
// PrefsContext.tsx exposes them to React.
export type Prefs = {
  theme: 'dark' | 'light';
  voiceMode: 'vad' | 'ptt';
  micSensitivity: number; // 0–100; higher triggers on quieter input
  pttKey: string; // KeyboardEvent.code, '' = unset
  micBoost: number; // 0–200 (%)
  masterVol: number; // 0–100
  sfxVol: number; // 0–100
  voiceVol: number; // 0–100
  inputId: string; // '' = default
  outputId: string; // '' = default
  playerVols: Record<string, number>; // per-player name, 0–100; missing = 100
};

const KEY = 'tint-prefs';

export const DEFAULT_PREFS: Prefs = {
  theme: 'dark',
  voiceMode: 'vad',
  micSensitivity: 50,
  pttKey: 'Space',
  micBoost: 100,
  masterVol: 100,
  sfxVol: 80,
  voiceVol: 100,
  inputId: '',
  outputId: '',
  playerVols: {},
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function loadPrefs(): Prefs {
  let saved: Partial<Prefs> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
  } catch {
    // Missing or corrupt storage — fall back to defaults.
  }
  return {
    theme: saved.theme === 'light' ? 'light' : 'dark',
    voiceMode: saved.voiceMode === 'ptt' ? 'ptt' : 'vad',
    micSensitivity: clamp(saved.micSensitivity, 0, 100, DEFAULT_PREFS.micSensitivity),
    pttKey: typeof saved.pttKey === 'string' ? saved.pttKey : DEFAULT_PREFS.pttKey,
    micBoost: clamp(saved.micBoost, 0, 200, DEFAULT_PREFS.micBoost),
    masterVol: clamp(saved.masterVol, 0, 100, DEFAULT_PREFS.masterVol),
    sfxVol: clamp(saved.sfxVol, 0, 100, DEFAULT_PREFS.sfxVol),
    voiceVol: clamp(saved.voiceVol, 0, 100, DEFAULT_PREFS.voiceVol),
    inputId: typeof saved.inputId === 'string' ? saved.inputId : '',
    outputId: typeof saved.outputId === 'string' ? saved.outputId : '',
    playerVols:
      saved.playerVols && typeof saved.playerVols === 'object' ? { ...saved.playerVols } : {},
  };
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private browsing can refuse storage; the pick still applies for this session.
  }
}

export function applyTheme(theme: Prefs['theme']) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

// VAD decision helper: RMS over a byte analyser frame, 0-255 scale. Kept pure
// so the threshold math has a unit test.
export function isSpeechFrame(maxByte: number, sensitivity: number): boolean {
  const cutoff = 128 - (sensitivity / 100) * 122; // 128 (insensitive) → 6 (sensitive)
  return maxByte >= cutoff;
}

// PTT matcher: compare against KeyboardEvent.code; '' keybind never matches so
// an unset bind can't wedge the mic open.
export function isPttKey(event: { code: string }, pttKey: string): boolean {
  return pttKey !== '' && event.code === pttKey;
}
