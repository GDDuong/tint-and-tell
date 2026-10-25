# Tint & Tell

A browser party game: one player gives word cues for a target color on a 24×20 grid, everyone else places two pawns and scores by closeness.

Play local pass-and-play or online rooms with text and voice chat.

## Play

https://tint-and-tell.onrender.com

Free Render instance: the first visit after ~15 minutes idle takes about a minute to wake.

## Run

```bash
npm install
npm run dev
```

```bash
npm test       # scoring and cue rules
npm run build
```

Rules live in `src/game.ts`; the screens are in `src/App.tsx` and the zoomable board in `src/Board.tsx`.
