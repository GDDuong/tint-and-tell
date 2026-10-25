import { useEffect, useState } from 'react';
import { AppSettings } from './AppSettings';
import Board from './Board';
import { ColorDots } from './ColorDots';
import { CueBanner } from './CueBanner';
import { LangToggle, useLang } from './Lang';
import { LocalPlayers } from './LocalPlayers';
import Online from './Online';
import { OptionsMenu } from './SettingsPanel';
import { SoundToggle } from './SoundToggle';
import { playSfx, setSfxMuted } from './sfx';
import {
  COLS,
  DEFAULT_SETTINGS,
  PALETTE,
  PAWN_HIDDEN_COLOR,
  PLAYER_COLORS,
  buildOrder,
  chebyshev,
  cueError,
  guessersFor,
  matchRounds,
  normalizeSettings,
  pickCandidates,
  placementPoints,
  scoreRound,
  type Placement,
  type Player,
  type Settings,
} from './game';
import type { StringKey, Vals } from './i18n';

type Phase =
  | { k: 'setup' }
  | { k: 'handoff'; to: number; next: Phase }
  | { k: 'pick' }
  | { k: 'vote'; guesser: number; votes: { id: number; yes: boolean }[] }
  | { k: 'cue2' }
  | { k: 'place'; pawn: 1 | 2; guesser: number }
  | { k: 'reveal' }
  | { k: 'final' };

type TFunc = (key: StringKey, vals?: Vals) => string;

const HERO_COLS = 12;
const HERO_BOARD = Array.from(
  { length: HERO_COLS * 5 },
  (_, i) =>
    PALETTE[(6 + Math.floor(i / HERO_COLS)) * COLS + 1 + (i % HERO_COLS) * 2].oklch,
);
const HERO_TARGET = HERO_COLS * 2 + 8;
const HERO_PAWNS: Record<number, string> = {
  [HERO_TARGET - 2]: PLAYER_COLORS[0],
  [HERO_TARGET + HERO_COLS + 1]: PLAYER_COLORS[1],
};

function roleFor(next: Phase, t: TFunc): string {
  if (next.k === 'pick') return t('role.pick');
  if (next.k === 'vote') return t('role.vote');
  if (next.k === 'cue2') return t('role.cue2');
  if (next.k === 'place') return t('role.place', { n: next.pawn });
  return t('role.continue');
}

function Setup({
  initial,
  onStart,
  onOnline,
  soundOn,
  onToggleSound,
  settings,
  onSettings,
}: {
  initial: Player[];
  onStart: (players: Player[], start: number) => void;
  onOnline: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  settings: Settings;
  onSettings: (next: Settings) => void;
}) {
  const { t } = useLang();
  const [names, setNames] = useState<string[]>(() =>
    initial.length ? initial.map((player) => player.name) : [1, 2, 3].map((n) => t('setup.playerName', { n })),
  );
  const [colors, setColors] = useState<string[]>(() =>
    initial.length ? initial.map((player) => player.color) : PLAYER_COLORS.slice(0, 3),
  );
  const [openColor, setOpenColor] = useState<number | null>(null);
  const [start, setStart] = useState(-1);

  const clean = names.map((name, index) => name.trim() || t('setup.playerName', { n: index + 1 }));
  const firstFreeColor = () =>
    PLAYER_COLORS.find((color) => !colors.includes(color)) ?? PLAYER_COLORS[0];

  const setName = (index: number, name: string) => {
    setNames((list) => list.map((value, i) => (i === index ? name : value)));
  };

  const add = () => {
    if (names.length >= 8) return;
    setNames((list) => [...list, t('setup.playerName', { n: list.length + 1 })]);
    setColors((list) => [...list, firstFreeColor()]);
  };

  const remove = (index: number) => {
    const nextLength = names.length - 1;
    setNames((list) => list.filter((_, i) => i !== index));
    setColors((list) => list.filter((_, i) => i !== index));
    setOpenColor(null);
    setStart((value) => {
      if (value === -1) return -1;
      let next = value;
      if (value === index) next = Math.min(index, nextLength - 1);
      else if (value > index) next = value - 1;
      return Math.min(Math.max(next, 0), nextLength - 1);
    });
  };

  const pickColor = (index: number, color: number) => {
    setColors((list) => list.map((value, i) => (i === index ? PLAYER_COLORS[color] : value)));
  };

  const startGame = () => {
    onStart(
      clean.map((name, index) => ({ id: index, name, color: colors[index] ?? PLAYER_COLORS[index] })),
      start,
    );
  };

  return (
    <>
      <div className="setup-bar">
        <div className="logo" aria-hidden="true">
          {PLAYER_COLORS.slice(0, 4).map((color) => (
            <i key={color} style={{ background: color }} />
          ))}
        </div>
        <div className="topbar-right">
          <a
            className="repo-link"
            href="https://github.com/GDDuong/tint-and-tell"
            target="_blank"
            rel="noreferrer"
            aria-label={t('setup.repo')}
            title={t('setup.repo')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"
              />
            </svg>
            <span className="repo-label">{t('setup.repo')}</span>
          </a>
          <LangToggle />
          <SoundToggle on={soundOn} onToggle={onToggleSound} />
          <AppSettings />
        </div>
      </div>

      <div className="setup-stage">
        <header className="setup-hero">
          <p className="eyebrow">{t('setup.tagline')}</p>
          <h1 className="hero-title">
            Tint <span className="amp">&</span> Tell
          </h1>
          <p className="hero-blurb">{t('setup.blurb')}</p>
          <div className="hero-lower">
            <div className="hero-board" aria-hidden="true">
              {HERO_BOARD.map((color, index) => (
                <span
                  key={index}
                  style={{ background: color }}
                  className={index === HERO_TARGET ? 'target' : undefined}
                >
                  {HERO_PAWNS[index] ? <i style={{ background: HERO_PAWNS[index] }} /> : null}
                </span>
              ))}
            </div>
            <div className="quick-rules">
              <p className="panel-title">{t('setup.howTitle')}</p>
              <ol>
                {(['setup.how1', 'setup.how2', 'setup.how3'] as const).map((key, index) => (
                  <li key={key}>
                    <span>{index + 1}</span>
                    <p>{t(key)}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </header>

        <div className="panel setup">
          <div className="setup-label">
            <p className="panel-title">{t('setup.players', { count: names.length })}</p>
            <button
              className="ghost small-btn"
              type="button"
              onClick={add}
              disabled={names.length >= 8}
            >
              {t('setup.addPlayer')}
            </button>
          </div>

          <div className="players">
            {names.map((name, index) => (
              <div className="player-block" key={index}>
                <div className="player-row">
                  <button
                    className="swatch-btn"
                    type="button"
                    onClick={() => setOpenColor(openColor === index ? null : index)}
                    aria-label={t('color.change')}
                    aria-expanded={openColor === index}
                  >
                    <span className="swatch" style={{ background: colors[index] }} />
                  </button>
                  <input
                    value={name}
                    onChange={(event) => setName(index, event.target.value)}
                    placeholder={t('setup.playerName', { n: index + 1 })}
                    maxLength={16}
                    aria-label={t('setup.nameLabel', { n: index + 1 })}
                  />
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => remove(index)}
                    disabled={names.length <= 3}
                    aria-label={t('setup.removeLabel', { n: index + 1 })}
                  >
                    ×
                  </button>
                </div>
                {openColor === index ? (
                  <ColorDots
                    value={Math.max(0, PLAYER_COLORS.indexOf(colors[index]))}
                    used={colors
                      .filter((_, i) => i !== index)
                      .map((color) => PLAYER_COLORS.indexOf(color))}
                    onPick={(color) => pickColor(index, color)}
                  />
                ) : null}
              </div>
            ))}
          </div>

          <label className="field">
            <span>{t('setup.startingGiver')}</span>
            <select value={start} onChange={(event) => setStart(Number(event.target.value))}>
              <option value={-1}>{t('common.random')}</option>
              {clean.map((name, index) => (
                <option key={index} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <OptionsMenu settings={settings} onChange={onSettings} canEdit />

          <button className="primary wide" type="button" onClick={startGame}>
            {t('setup.start')}
          </button>
          <button className="ghost wide" type="button" onClick={onOnline}>
            {t('setup.online')}
          </button>
          <p className="hint-line">{t('setup.hint')}</p>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const { lang, t } = useLang();
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>({ k: 'setup' });
  const [candidates, setCandidates] = useState<number[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [cue1, setCue1] = useState('');
  const [cue2, setCue2] = useState('');
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [pending, setPending] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [online, setOnline] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return normalizeSettings(JSON.parse(localStorage.getItem('tint-settings') ?? '{}'));
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const control = (event.target as Element | null)?.closest('button, select');
      if (control && !control.matches(':disabled')) playSfx('tap');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSfxMuted(!next);
  }

  function updateSettings(next: Settings) {
    setSettings(next);
    try {
      localStorage.setItem('tint-settings', JSON.stringify(next));
    } catch {
      // Private browsing can refuse storage; the settings still apply for this session.
    }
  }

  function renamePlayer(id: number, name: string) {
    setPlayers((list) => list.map((player) => (player.id === id ? { ...player, name } : player)));
  }

  function recolorPlayer(id: number, color: string) {
    setPlayers((list) => list.map((player) => (player.id === id ? { ...player, color } : player)));
  }

  function beginRound(seq: number[], index: number) {
    setCandidates(pickCandidates());
    setTarget(null);
    setCue1('');
    setCue2('');
    setPlacements([]);
    setPending(null);
    setPhase({ k: 'handoff', to: seq[index], next: { k: 'pick' } });
  }

  function startMatch(nextPlayers: Player[], startIndex: number) {
    playSfx('cue');
    const seq = buildOrder(
      nextPlayers.map((player) => player.id),
      startIndex < 0 ? null : startIndex,
      settings.shuffledGivers,
    );
    setPlayers(nextPlayers);
    setScores(nextPlayers.map(() => 0));
    setOrder(seq);
    setRound(0);
    beginRound(seq, 0);
  }

  function rematch() {
    setScores(players.map(() => 0));
    setRound(0);
    beginRound(order, 0);
  }

  const rounds = matchRounds(players.length, settings);

  function advanceRound() {
    if (round + 1 >= rounds) {
      playSfx('win');
      setPhase({ k: 'final' });
      return;
    }
    setRound(round + 1);
    beginRound(order, round + 1);
  }

  const giverId = order.length ? order[round % order.length] : 0;
  const giver = players[giverId];
  const guessers = guessersFor(order, round);
  const anonymous = settings.grayPawns && phase.k !== 'reveal';
  const pawnViews = placements.map((placement) => ({
    key: `${placement.playerId}-${placement.pawn}`,
    cell: placement.cell,
    color: anonymous ? PAWN_HIDDEN_COLOR : players[placement.playerId].color,
  }));

  function finishRound(done: Placement[]) {
    playSfx('reveal');
    const points = scoreRound(giverId, target!, done, players.length);
    setScores((prev) => prev.map((score, index) => score + points[index]));
    setPhase({ k: 'reveal' });
  }

  function submitCue1() {
    if (target == null || cueError(cue1, 1, lang)) return;
    playSfx('cue');
    const first = guessers[0];
    setPhase({ k: 'handoff', to: first, next: { k: 'place', pawn: 1, guesser: first } });
  }

  function submitCue2() {
    if (cueError(cue2, 2, lang)) return;
    playSfx('cue');
    const first = guessers[0];
    setPhase({ k: 'handoff', to: first, next: { k: 'place', pawn: 2, guesser: first } });
  }

  function confirmPlacement() {
    if (phase.k !== 'place' || pending == null) return;
    playSfx('place');
    const { pawn, guesser } = phase;
    const next: Placement[] = [...placements, { playerId: guesser, pawn, cell: pending }];
    setPlacements(next);
    setPending(null);
    const index = guessers.indexOf(guesser);
    if (index < guessers.length - 1) {
      const to = guessers[index + 1];
      setPhase({ k: 'handoff', to, next: { k: 'place', pawn, guesser: to } });
    } else if (pawn === 1) {
      if (settings.oneCue) {
        finishRound(next);
      } else if (settings.voteSecondCue) {
        const to = guessers[0];
        setPhase({
          k: 'handoff',
          to,
          next: { k: 'vote', guesser: to, votes: [] },
        });
      } else {
        setPhase({ k: 'handoff', to: giverId, next: { k: 'cue2' } });
      }
    } else {
      finishRound(next);
    }
  }

  if (online) {
    return (
      <Online onBack={() => setOnline(false)} soundOn={soundOn} onToggleSound={toggleSound} />
    );
  }

  if (phase.k === 'setup') {
    return (
      <div className="app setup-app">
        <Setup
          initial={players}
          onStart={startMatch}
          onOnline={() => setOnline(true)}
          soundOn={soundOn}
          onToggleSound={toggleSound}
          settings={settings}
          onSettings={updateSettings}
        />
      </div>
    );
  }

  const header = (
    <div className="topbar">
      <span className="wordmark">
        Tint <b>&</b> Tell
      </span>
      <div className="topbar-right">
        <span className="muted small">
          {t('common.round', { n: round + 1, total: rounds })}
        </span>
        <LocalPlayers players={players} onRename={renamePlayer} onColor={recolorPlayer} />
        <LangToggle />
        <SoundToggle on={soundOn} onToggle={toggleSound} />
        <AppSettings />
      </div>
    </div>
  );

  if (phase.k === 'handoff') {
    const player = players[phase.to];
    return (
      <div className="app">
        {header}
        <div className="screen-center">
          <span className="handoff-dot" style={{ background: player.color }} />
          <p className="eyebrow">{t('handoff.eyebrow')}</p>
          <h1 className="handoff-name">{player.name}</h1>
          <p className="muted">{roleFor(phase.next, t)}</p>
          <p className="hint-line">{t('handoff.hint')}</p>
          <button className="primary" type="button" onClick={() => setPhase(phase.next)}>
            {t('handoff.continue', { name: player.name })}
          </button>
        </div>
      </div>
    );
  }

  if (phase.k === 'pick') {
    const error = cueError(cue1, 1, lang);
    return (
      <div className="app">
        {header}
        <div className="screen">
          <div className="screen-head">
            <p className="eyebrow">{t('pick.eyebrow', { name: giver.name })}</p>
            <h2>{t('pick.title')}</h2>
            <p className="muted small">{t('pick.hint')}</p>
          </div>
          <Board
            candidates={candidates}
            selected={target}
            onCell={(cell) => {
              if (candidates.includes(cell) && cell !== target) setTarget(cell);
            }}
          />
          <form
            className="panel"
            onSubmit={(event) => {
              event.preventDefault();
              submitCue1();
            }}
          >
            <label className="field">
              <span>{t('pick.label')}</span>
              <input
                value={cue1}
                onChange={(event) => setCue1(event.target.value)}
                placeholder={t('pick.placeholder')}
                autoComplete="off"
                maxLength={24}
              />
            </label>
            {cue1.trim() && error ? <p className="error">{error}</p> : null}
            <button className="primary wide" type="submit" disabled={target == null || error != null}>
              {target == null ? t('pick.lockFirst') : t('pick.lockCue1')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (phase.k === 'place') {
    const me = players[phase.guesser];
    return (
      <div className="app">
        {header}
        <div className="screen">
          <div className="screen-head">
            <p className="eyebrow">{t('place.eyebrow', { name: giver.name })}</p>
            <h2>{t('place.title', { name: me.name, n: phase.pawn })}</h2>
            <CueBanner cue1={cue1} cue2={cue2} />
          </div>
          <Board
            pawns={settings.hideFirstPawns && phase.pawn === 1 ? [] : pawnViews}
            selected={pending}
            ghostColor={me.color}
            onCell={setPending}
          />
          <div className="panel">
            <p className="muted small">
              {pending == null ? t('place.hintNone') : t('place.hintAdjust')}
            </p>
            {phase.pawn === 1 && settings.hideFirstPawns ? (
              <p className="hint-line">{t('place.hiddenHint')}</p>
            ) : null}
            {phase.pawn === 2 && settings.grayPawns ? (
              <p className="hint-line">{t('place.anonHint')}</p>
            ) : null}
            <button className="primary wide" type="button" onClick={confirmPlacement} disabled={pending == null}>
              {t('place.confirm', { n: phase.pawn })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase.k === 'vote') {
    const voter = players[phase.guesser];
    const castVote = (yes: boolean) => {
      const votes = [...phase.votes, { id: phase.guesser, yes }];
      const index = guessers.indexOf(phase.guesser);
      if (index < guessers.length - 1) {
        const to = guessers[index + 1];
        setPhase({ k: 'handoff', to, next: { k: 'vote', guesser: to, votes } });
        return;
      }
      const yesVotes = votes.filter((vote) => vote.yes).length;
      if (yesVotes * 2 > guessers.length) {
        setPhase({ k: 'handoff', to: giverId, next: { k: 'cue2' } });
      } else {
        finishRound(placements);
      }
    };

    return (
      <div className="app">
        {header}
        <div className="screen-center">
          <span className="handoff-dot" style={{ background: voter.color }} />
          <p className="eyebrow">{t('vote.eyebrow', { name: voter.name })}</p>
          <h2>{t('vote.title')}</h2>
          <div className="cue-card">
            <CueBanner cue1={cue1} />
            <p className="muted small">{t('vote.hint')}</p>
            <button className="primary wide" type="button" onClick={() => castVote(true)}>
              {t('vote.yes')}
            </button>
            <button className="ghost wide" type="button" onClick={() => castVote(false)}>
              {t('vote.no')}
            </button>
          </div>
          <p className="hint-line">{t('vote.privateHint')}</p>
        </div>
      </div>
    );
  }

  if (phase.k === 'cue2') {
    const error = cueError(cue2, 2, lang);
    return (
      <div className="app">
        {header}
        <div className="screen-center">
          <div className="cue-card">
            <p className="eyebrow">{t('cue2.eyebrow', { name: giver.name })}</p>
            <h2>{t('cue2.title')}</h2>
            <p className="cue-recap">{t('cue2.recap', { cue: cue1 })}</p>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                submitCue2();
              }}
            >
              <label className="field">
                <span>{t('cue2.label')}</span>
                <input
                  value={cue2}
                  onChange={(event) => setCue2(event.target.value)}
                  placeholder={t('cue2.placeholder')}
                  autoComplete="off"
                  maxLength={24}
                />
              </label>
              {cue2.trim() && error ? <p className="error">{error}</p> : null}
              <button className="primary wide" type="submit" disabled={error != null}>
                {t('cue2.lock')}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (phase.k === 'reveal') {
    if (target == null) return null;
    const perPawn = players.length === 3 ? 2 : 1;
    const inFrame = placements.filter((placement) => chebyshev(placement.cell, target) <= 1).length;
    const giverPoints = inFrame * perPawn;
    const ranked = players
      .map((player) => ({ ...player, score: scores[player.id] }))
      .sort((a, b) => b.score - a.score || a.id - b.id);
    const lastRound = round === rounds - 1;

    return (
      <div className="app">
        {header}
        <div className="screen">
          <div className="screen-head">
            <p className="eyebrow">{t('reveal.eyebrow')}</p>
            <h2>{t('reveal.title', { n: round + 1 })}</h2>
            <CueBanner cue1={cue1} cue2={cue2} />
          </div>

          <Board selected={target} frame pawns={pawnViews} />

          <div className="panel">
            <p className="panel-title">{t('reveal.points')}</p>
            <div className="breakdown">
              <div className="breakdown-group">
                <div className="subline">
                  <b>{t('reveal.giver', { name: giver.name })}</b>
                  <b>+{giverPoints}</b>
                </div>
                <div className="subline muted-line">
                  <span>{t('reveal.frame', { n: inFrame, total: placements.length })}</span>
                  <span>{t('reveal.perPawn', { n: perPawn })}</span>
                </div>
              </div>
              {guessers.map((id) => {
                const mine = placements.filter((placement) => placement.playerId === id);
                const total = mine.reduce(
                  (sum, placement) => sum + placementPoints(placement, giverId, target, players.length),
                  0,
                );
                return (
                  <div key={id} className="breakdown-group">
                    <div className="subline">
                      <b>{players[id].name}</b>
                      <b>+{total}</b>
                    </div>
                    {mine.map((placement) => {
                      const distance = chebyshev(placement.cell, target);
                      return (
                        <div key={placement.pawn} className="subline muted-line">
                          <span>
                            {distance === 0
                              ? t('reveal.pawnHit', { n: placement.pawn })
                              : t('reveal.pawnAway', { n: placement.pawn, d: distance })}
                          </span>
                          <span>+{placementPoints(placement, giverId, target, players.length)}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <p className="panel-title">{t('reveal.scoreboard')}</p>
            {settings.hideScores ? (
              <p className="hint-line">{t('reveal.secretHint')}</p>
            ) : (
              <div className="score-list">
                {ranked.map((player, index) => (
                  <div key={player.id} className="score-row">
                    <span className="score-name">
                      <span className="swatch small-swatch" style={{ background: player.color }} />
                      <span>
                        {index + 1}. {player.name}
                      </span>
                    </span>
                    <span className="score-value">{player.score}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="primary wide" type="button" onClick={advanceRound}>
              {lastRound ? t('common.final') : t('reveal.next', { n: round + 2, total: rounds })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ranked = players
    .map((player) => ({ ...player, score: scores[player.id] }))
    .sort((a, b) => b.score - a.score || a.id - b.id);
  const topScore = ranked[0]?.score ?? 0;
  const winners = ranked.filter((player) => player.score === topScore);

  return (
    <div className="app">
      <div className="topbar">
        <span className="wordmark">
          Tint <b>&</b> Tell
        </span>
        <div className="topbar-right">
          <LocalPlayers players={players} onRename={renamePlayer} onColor={recolorPlayer} />
          <LangToggle />
          <SoundToggle on={soundOn} onToggle={toggleSound} />
          <AppSettings />
        </div>
      </div>
      <div className="screen-center final">
        <p className="eyebrow">{t('common.final')}</p>
        <h1>{winners.length > 1 ? t('final.tie') : t('final.wins', { name: winners[0].name })}</h1>
        <div className="panel final-board">
          <div className="score-list">
            {ranked.map((player, index) => (
              <div key={player.id} className="score-row">
                <span className="score-name">
                  <span className="swatch small-swatch" style={{ background: player.color }} />
                  <span>
                    {index + 1}. {player.name}
                  </span>
                </span>
                <span className="score-value">{player.score}</span>
              </div>
            ))}
          </div>
          <div className="button-row">
            <button className="primary" type="button" onClick={rematch}>
              {t('final.rematch')}
            </button>
            <button className="ghost" type="button" onClick={() => setPhase({ k: 'setup' })}>
              {t('final.newSetup')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
