# Tint & Tell

A pass-and-play browser party game: one player gives word cues for a target color on a 24×20 grid, everyone else places two pawns and scores by closeness.

M0 is entirely local. No server, accounts, or persistence.

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
