# Tint & Tell

A browser party game about describing colors with words. A secret cell is picked on a 24×20 color board, the cue giver describes it in one word, and everyone else places pawns where they think that color lives. Score by how close you land. Inspired by Hues and Cues.

**Play online:** https://tint-and-tell.onrender.com — free Render instance, so the first visit after ~15 minutes idle takes about a minute to wake.

## Features

- **Local pass-and-play** for 3–8 players on one device, with handoff screens that keep cues and guesses secret.
- **Online rooms** with a 4-character code, up to 8 seats, live lobby, text chat, and peer-to-peer voice chat.
- **Host controls**: kick people from the room, disband it for everyone, or leave and pick the next host.
- **Spectator mode**: anyone can watch the current round; people joining mid-game become spectators automatically and can join as players once the room is back in the lobby.
- **Player colors**: pick from eight palette colors (unique per room) in the local setup, the local in-game Players panel, or the online lobby.
- **Rename local players** any time from the Players panel in the top bar.
- **Two languages**: English and Vietnamese, switchable per player, with Vietnamese as the default.
- **Voice chat**: voice activation or push-to-talk, mic sensitivity, mic boost, mute/deafen, and per-player volume. Device pickers use the real device names (mic permission is required before browsers reveal them).
- **Game options**: hidden pawns, anonymous pawns, a vote for a second cue, one-cue games, two laps, secret scores, and shuffled cue givers.

## Game flow

1. Four candidate cells are drawn at least three cells apart. The cue giver picks one and writes **cue 1**: exactly one word.
2. Every guesser privately places pawn 1.
3. Optional: guessers vote on whether the giver gets a second cue. A majority yes means cue 2; a tie ends the round.
4. The giver writes **cue 2** (up to two words), and guessers place pawn 2.
5. Reveal: the target cell is shown and everyone scores. The next player gives cues.

Cues are validated: they cannot be color names in English or Vietnamese, or look like grid coordinates, and are capped at 24 characters.

## Scoring

Distance uses Chebyshev distance on the grid (diagonals count as 1).

| Pawn distance from target | Points |
| --- | --- |
| On the cell | 3 |
| Adjacent (incl. diagonal) | 2 |
| Two cells away | 1 |
| Farther | 0 |

The giver scores 1 point per pawn inside the 3×3 frame around the target (2 points per pawn in 3-player games). A normal match has one round per player; **Two laps** doubles that. **Secret scores** hides running totals until the final standings.

## Room options

| Option | Effect |
| --- | --- |
| Hide first pawns | Pawn 1 stays hidden until everyone has placed; positions appear for cue 2. |
| Anonymous pawns | All pawns stay grey until the reveal. Requires hidden first pawns. |
| Vote for cue 2 | After pawn 1, guessers vote; a majority unlocks cue 2, a tie goes straight to reveal. |
| One cue only | One pawn per player; skips cue 2 and the vote. |
| Two laps | Every player gives cues twice. |
| Secret scores | Running totals stay hidden until the final standings. |
| Shuffled givers | Random cue-giver order instead of seating order. |

The host controls these in the lobby; everyone else sees them read-only.

## Online play

- Create a room to get a 4-letter code (ambiguous characters like `I`, `O`, `0`, `1` are excluded), or join with a code and a display name.
- Rooms hold up to 8 people including spectators. At least 2 active players are needed to start.
- Joining while a round is in progress seats you as a spectator. Spectators see the board and chat but cannot place pawns or give cues.
- Players can switch to spectating at any time; switching back is only possible in the lobby between games.
- Chat is plain text (160 characters max). Cue-givers can also talk strategy there.
- Dropped connections lose their seat. There are no accounts, reconnect tokens, or persistence — rooms live in server memory and reset when the server restarts or sleeps.

## Voice chat

- **Voice activation** (VAD) sends only when you speak; adjust sensitivity and mic boost in Settings. **Push-to-talk** sends while holding the key (Space by default; rebind it in Settings).
- Mute and deafen toggles sit in the lobby bar. Each player gets a volume slider.
- Audio is a WebRTC peer mesh with public STUN servers only (no TURN relay). It works through most home NATs but may fail on strict or corporate networks.
- Voice needs HTTPS (Render provides it) and mic permission. The device dropdown shows real names only after permission is granted.

## App settings

The gear popover (separate from the room options) holds:

- Theme: dark (default) or light
- Language: English / Tiếng Việt
- Voice mode, mic sensitivity, push-to-talk key, mic amplification
- Microphone and speaker selection
- Master, SFX, and voice volume

Preferences are stored in `localStorage` (`tint-prefs`); nothing is sent to a server.

## Tech stack

- React 19 + TypeScript 6, built with Vite 8
- Socket.IO 4 for rooms, game state, chat, and voice signaling
- WebRTC for voice audio; Web Audio API for VAD and mic boost
- `node:test` for unit tests, oxlint for linting
- Node.js 24+ (the production server runs TypeScript directly via type stripping)

The server is authoritative for online rooms: cues, placements, votes, scoring, host actions, and spectator state are validated there, and each client only receives what it is allowed to see (the target stays hidden from guessers until the reveal).

## Run locally

Requires Node.js 24 or newer.

```bash
npm install
npm run dev
```

`npm run dev` starts Vite on http://localhost:5173 and attaches the Socket.IO game server to the same port, so local and online play work together.

```bash
npm test        # game rules, rooms, online rounds, chat, preferences
npm run build   # type-check and build the client into dist/
npm start       # serve dist/ + Socket.IO (PORT env var, default 5173)
npm run lint
```

Run `npm run build` before `npm start`.

## Project layout

```
src/        React client: local game (App.tsx), online lobby (Online.tsx),
            online rounds (GameOnline.tsx), color board (Board.tsx),
            rules and scoring (game.ts), i18n, preferences, voice, SFX
server/     Socket.IO handlers (socket.ts), rooms (rooms.ts), authoritative
            game rounds (game.ts), chat sanitizer, production server (index.ts)
test/       node:test suites for rules, rooms, online play, chat, and prefs
public/     favicon and sound effects
```

## Deploy

The app is live at https://tint-and-tell.onrender.com on Render's free tier.

- Repository: https://github.com/GDDuong/tint-and-tell
- Render setup: Web Service, Node runtime, build `npm ci && npm run build`, start `npm start`, free instance.
- `render.yaml` describes the same service for Render Blueprints; `.node-version` pins Node 24.
- Pushing to `main` redeploys automatically.
- The free instance sleeps after ~15 minutes without traffic; the next visit wakes it in about a minute, and all in-memory rooms are gone.

## Notes and limitations

- No accounts and no database: rooms, scores, and chat exist only in memory.
- No reconnection tokens yet: a refresh or dropped connection gives up your seat.
- Voice is STUN-only; add a TURN server if players behind strict NATs cannot hear each other.
- The free Render plan has monthly instance-hour limits and cold starts.

## License

MIT — see [LICENSE](LICENSE).
