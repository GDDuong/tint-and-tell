// Kenney "Interface Sounds" (CC0) — see public/sfx/LICENSE.txt.
export type Sfx = 'tick' | 'tap' | 'place' | 'cue' | 'reveal' | 'win';

const files: Record<Sfx, string> = {
  tick: '/sfx/tick.mp3',
  tap: '/sfx/tap.mp3',
  place: '/sfx/place.mp3',
  cue: '/sfx/cue.mp3',
  reveal: '/sfx/reveal.mp3',
  win: '/sfx/win.mp3',
};

const volumes: Record<Sfx, number> = {
  tick: 0.35,
  tap: 0.5,
  place: 0.7,
  cue: 0.6,
  reveal: 0.65,
  win: 0.75,
};

const tracks = Object.fromEntries(
  (Object.keys(files) as Sfx[]).map((kind) => {
    const audio = new Audio(files[kind]);
    audio.preload = 'auto';
    audio.volume = volumes[kind];
    return [kind, audio];
  }),
) as Record<Sfx, HTMLAudioElement>;

let muted = false;
let volumeScale = 1;

export function setSfxMuted(value: boolean) {
  muted = value;
}

export function setSfxVolume(scale: number) {
  volumeScale = scale;
}

export function playSfx(kind: Sfx) {
  if (muted) return;
  const audio = tracks[kind];
  audio.volume = Math.min(1, volumes[kind] * volumeScale);
  if (audio.currentTime > 0) audio.currentTime = 0;
  void audio.play().catch(() => {});
}
