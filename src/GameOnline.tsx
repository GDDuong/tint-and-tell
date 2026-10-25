import { useEffect, useRef, useState } from 'react';
import type { GameView } from '../server/game.ts';
import type { RoomView } from '../server/rooms.ts';
import Board from './Board';
import { Chat } from './Chat';
import { CueBanner } from './CueBanner';
import { LangToggle, useLang } from './Lang';
import type { VoiceState } from './Online';
import { SoundToggle } from './SoundToggle';
import { PAWN_HIDDEN_COLOR, PLAYER_COLORS, chebyshev, cueError, pawnPoints } from './game';
import { translateServerError } from './i18n';
import { playSfx } from './sfx';
import { socket } from './socket';
import { VoiceControls } from './VoiceControls';

type Reply = { ok: true } | { ok: false; error: string };

type Props = {
  room: RoomView;
  youId: number;
  game: GameView;
  soundOn: boolean;
  onToggleSound: () => void;
  onLeave: () => void;
  onSpectate: () => void;
  voice: VoiceState;
};

export default function GameOnline(props: Props) {
  const lastPhase = useRef(props.game.phase);
  useEffect(() => {
    const before = lastPhase.current;
    lastPhase.current = props.game.phase;
    if (before === props.game.phase) return;
    if (props.game.phase === 'reveal') playSfx('reveal');
    if (props.game.phase === 'final') playSfx('win');
  }, [props.game.phase]);

  return <GameScreen key={`${props.game.round}-${props.game.phase}`} {...props} />;
}

function GameScreen({
  room,
  youId,
  game,
  soundOn,
  onToggleSound,
  onLeave,
  onSpectate,
  voice,
}: Props) {
  const { lang, t } = useLang();
  const [cue1, setCue1] = useState('');
  const [cue2, setCue2] = useState('');
  const [target, setTarget] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const playerById = new Map(room.players.map((player) => [player.id, player]));
  const colorFor = (id: number) => PLAYER_COLORS[playerById.get(id)?.color ?? 0];
  const nameFor = (id: number) => playerById.get(id)?.name ?? t('game.playerFallback');
  const you = playerById.get(youId);
  const giverName = nameFor(game.giverId);
  const hostName = nameFor(room.hostId);
  const isGiver = youId === game.giverId;
  const isHost = youId === room.hostId;
  const participants = game.scores.map((entry) => ({
    id: entry.id,
    name: nameFor(entry.id),
    color: colorFor(entry.id),
    score: entry.score,
  }));
  const pointsOf = (id: number) => game.points?.find((entry) => entry.id === id)?.points ?? 0;
  // ponytail: identities are masked at render time; placements still carry playerId on the wire.
  const anonymous =
    game.settings.grayPawns && game.phase !== 'reveal' && game.phase !== 'final';
  const pawnViews = game.placements.map((placement) => ({
    key: `${placement.playerId}-${placement.pawn}`,
    cell: placement.cell,
    color: anonymous ? PAWN_HIDDEN_COLOR : colorFor(placement.playerId),
  }));
  const waiting = game.waitingOn.map(nameFor);
  const waitingLine = waiting.length
    ? t('game.waitingFor', { names: waiting.join(', ') })
    : t('game.counting');

  function send(event: string, payload: { [key: string]: unknown } | null, sfx?: 'cue' | 'place') {
    if (busy) return;
    setBusy(true);
    setError('');
    if (sfx) playSfx(sfx);
    const done = (reply: Reply) => {
      setBusy(false);
      if (!reply?.ok) setError(translateServerError(lang, reply?.error ?? t('online.error.generic')));
    };
    if (payload) socket.emit(event, payload, done);
    else socket.emit(event, done);
  }

  const header = (
    <div className="topbar">
      <span className="wordmark">
        Tint <b>&</b> Tell
      </span>
      <div className="topbar-right">
        <span className="muted small">
          {game.phase === 'final'
            ? t('common.final')
            : t('common.round', { n: game.round + 1, total: game.totalRounds })}
        </span>
        {game.inGame ? (
          <button className="ghost small-btn" type="button" onClick={onSpectate}>
            {t('spectate.watch')}
          </button>
        ) : (
          <span className="watch-tag">{t('spectate.tag')}</span>
        )}
        <Chat room={room} youId={youId} game={game} />
        <VoiceControls
          status={voice.status}
          muted={voice.muted}
          deafened={voice.deafened}
          onMute={voice.setMuted}
          onDeafen={voice.setDeafened}
        />
        <LangToggle />
        <SoundToggle on={soundOn} onToggle={onToggleSound} />
        <button className="ghost small-btn" type="button" onClick={onLeave}>
          {t('game.leave')}
        </button>
      </div>
    </div>
  );

  if (game.phase === 'cue1' && isGiver) {
    const cueProblem = cueError(cue1, 1, lang);
    const ready = target != null && cueProblem == null;
    return (
      <div className="app">
        {header}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="screen">
          <div className="screen-head">
            <p className="eyebrow">{t('game.pickEyebrow')}</p>
            <h2>{t('pick.title')}</h2>
            <p className="muted small">{t('pick.hint')}</p>
          </div>
          <Board
            candidates={game.candidates ?? []}
            selected={target}
            onCell={(cell) => {
              if (game.candidates?.includes(cell)) setTarget(cell);
            }}
          />
          <form
            className="panel"
            onSubmit={(event) => {
              event.preventDefault();
              if (ready) send('game:cue1', { target, cue: cue1 }, 'cue');
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
            {cue1.trim() && cueProblem ? <p className="error">{cueProblem}</p> : null}
            <button className="primary wide" type="submit" disabled={!ready || busy}>
              {target == null ? t('pick.lockFirst') : t('pick.lockCue1')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (game.phase === 'cue1') {
    return (
      <div className="app">
        {header}
        <div className="screen-center">
          <span className="handoff-dot" style={{ background: colorFor(game.giverId) }} />
          <p className="eyebrow">{t('game.picking', { name: giverName })}</p>
          <h2>{t('game.getReady')}</h2>
          <p className="muted">{t('game.oneWordComing')}</p>
          {game.inGame ? (
            <p className="hint-line">
              {t('common.round', { n: game.round + 1, total: game.totalRounds })}
            </p>
          ) : (
            <p className="hint-line">{t('spectate.hint')}</p>
          )}
        </div>
      </div>
    );
  }

  if (game.phase === 'cue2' && isGiver) {
    const cueProblem = cueError(cue2, 2, lang);
    return (
      <div className="app">
        {header}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="screen-center">
          <div className="cue-card">
            <p className="eyebrow">{t('cue2.eyebrow', { name: giverName })}</p>
            <h2>{t('cue2.title')}</h2>
            <p className="cue-recap">{t('cue2.recap', { cue: game.cue1 })}</p>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (cueProblem == null) send('game:cue2', { cue: cue2 }, 'cue');
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
              {cue2.trim() && cueProblem ? <p className="error">{cueProblem}</p> : null}
              <button className="primary wide" type="submit" disabled={cueProblem != null || busy}>
                {t('cue2.lock')}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (game.phase === 'cue2') {
    return (
      <div className="app">
        {header}
        <div className="screen-center">
          <span className="handoff-dot" style={{ background: colorFor(game.giverId) }} />
          <p className="eyebrow">{t('cue2.eyebrow', { name: giverName })}</p>
          <h2>{t('cue2.waitingTitle')}</h2>
          <CueBanner cue1={game.cue1} />
          <p className="muted small">{t('cue2.waitingHint')}</p>
          {game.inGame ? null : <p className="hint-line">{t('spectate.hint')}</p>}
        </div>
      </div>
    );
  }

  if (game.phase === 'vote') {
    if (isGiver || !game.inGame) {
      return (
        <div className="app">
          {header}
          <div className="screen">
            <div className="screen-head">
              <p className="eyebrow">{t('game.vote.eyebrow', { name: giverName })}</p>
              <h2>{t('game.vote.giverWaiting')}</h2>
              <CueBanner cue1={game.cue1} />
              <p className="muted small">{waitingLine}</p>
            </div>
            <Board selected={game.target} frame pawns={pawnViews} />
          </div>
        </div>
      );
    }

    if (!game.youVoted) {
      return (
        <div className="app">
          {header}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="screen">
            <div className="screen-head">
              <p className="eyebrow">{t('game.vote.placed')}</p>
              <h2>{t('vote.title')}</h2>
              <CueBanner cue1={game.cue1} />
            </div>
            <Board pawns={pawnViews} />
            <div className="panel">
              <p className="muted small">{t('game.vote.hint')}</p>
              <button
                className="primary wide"
                type="button"
                disabled={busy}
                onClick={() => send('game:vote', { yes: true })}
              >
                {t('vote.yes')}
              </button>
              <button
                className="ghost wide"
                type="button"
                disabled={busy}
                onClick={() => send('game:vote', { yes: false })}
              >
                {t('vote.no')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="app">
        {header}
        <div className="screen">
          <div className="screen-head">
            <p className="eyebrow">{t('game.vote.sent')}</p>
            <h2>{t('game.vote.waiting')}</h2>
            <CueBanner cue1={game.cue1} />
            <p className="muted small">{waitingLine}</p>
          </div>
          <Board pawns={pawnViews} />
        </div>
      </div>
    );
  }

  if (game.phase === 'place1' || game.phase === 'place2') {
    const wave = game.phase === 'place1' ? 1 : 2;
    const canPlace = game.inGame && !isGiver && !game.youPlaced;
    if (canPlace) {
      return (
        <div className="app">
          {header}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="screen">
            <div className="screen-head">
              <p className="eyebrow">{t('place.eyebrow', { name: giverName })}</p>
              <h2>{t('place.title', { name: you?.name ?? t('game.playerFallback'), n: wave })}</h2>
              <CueBanner cue1={game.cue1} cue2={game.cue2 || undefined} />
            </div>
            <Board
              pawns={pawnViews}
              selected={pending}
              ghostColor={colorFor(youId)}
              onCell={setPending}
            />
            <div className="panel">
              <p className="muted small">
                {pending == null ? t('place.hintNone') : t('place.hintAdjust')}
              </p>
              {game.phase === 'place1' && game.settings.hideFirstPawns ? (
                <p className="hint-line">{t('place.hiddenHint')}</p>
              ) : null}
              {anonymous ? (
                <p className="hint-line">{t('place.anonHint')}</p>
              ) : null}
              <button
                className="primary wide"
                type="button"
                disabled={pending == null || busy}
                onClick={() => {
                  if (pending != null) send('game:place', { cell: pending }, 'place');
                }}
              >
                {t('place.confirm', { n: wave })}
              </button>
            </div>
          </div>
        </div>
      );
    }
    const placedLine = waiting.length
      ? t('game.waitingFor', { names: waiting.join(', ') })
      : t('game.everyoneIn');
    return (
      <div className="app">
        {header}
        <div className="screen">
          <div className="screen-head">
            <p className="eyebrow">{t('place.eyebrow', { name: giverName })}</p>
            <h2>
              {!game.inGame
                ? t('spectate.tag')
                : isGiver
                  ? t('game.waitingGuesses')
                  : t('game.pawnPlaced', { n: wave })}
            </h2>
            <CueBanner cue1={game.cue1} cue2={game.cue2 || undefined} />
            <p className="muted small">{placedLine}</p>
            {game.phase === 'place1' && game.settings.hideFirstPawns ? (
              <p className="hint-line">{t('game.pawnsAppear')}</p>
            ) : null}
          </div>
          <Board
            selected={isGiver ? game.target : null}
            frame
            pawns={pawnViews}
          />
        </div>
      </div>
    );
  }

  if (game.phase === 'reveal' && game.target != null) {
    const target = game.target;
    const perPawn = game.scores.length === 3 ? 2 : 1;
    const inFrame = game.placements.filter(
      (placement) => chebyshev(placement.cell, target) <= 1,
    ).length;
    const guessers = participants.filter((player) => player.id !== game.giverId);
    const ranked = [...participants].sort((a, b) => b.score - a.score || a.id - b.id);
    const lastRound = game.round === game.totalRounds - 1;

    return (
      <div className="app">
        {header}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="screen">
          <div className="screen-head">
            <p className="eyebrow">{t('reveal.eyebrow')}</p>
            <h2>{t('reveal.title', { n: game.round + 1 })}</h2>
            <CueBanner cue1={game.cue1} cue2={game.cue2 || undefined} />
          </div>

          <Board selected={target} frame pawns={pawnViews} />

          <div className="panel">
            <p className="panel-title">{t('reveal.points')}</p>
            <div className="breakdown">
              <div className="breakdown-group">
                <div className="subline">
                  <b>{t('reveal.giver', { name: giverName })}</b>
                  <b>+{pointsOf(game.giverId)}</b>
                </div>
                <div className="subline muted-line">
                  <span>{t('reveal.frame', { n: inFrame, total: game.placements.length })}</span>
                  <span>{t('reveal.perPawn', { n: perPawn })}</span>
                </div>
              </div>
              {guessers.map((player) => {
                const mine = game.placements.filter(
                  (placement) => placement.playerId === player.id,
                );
                return (
                  <div key={player.id} className="breakdown-group">
                    <div className="subline">
                      <b>{player.name}</b>
                      <b>+{pointsOf(player.id)}</b>
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
                          <span>+{pawnPoints(distance)}</span>
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
            {game.settings.hideScores ? (
              <p className="hint-line">{t('reveal.secretHint')}</p>
            ) : (
              <div className="score-list">
                {ranked.map((player, index) => (
                  <div key={player.id} className="score-row">
                    <span className="score-name">
                      <span
                        className="swatch small-swatch"
                        style={{ background: player.color }}
                      />
                      <span>
                        {index + 1}. {player.name}
                      </span>
                    </span>
                    <span className="score-value">{player.score}</span>
                  </div>
                ))}
              </div>
            )}
            {isHost ? (
              <button
                className="primary wide"
                type="button"
                disabled={busy}
                onClick={() => send('game:next', null)}
              >
                {lastRound
                  ? t('common.final')
                  : t('reveal.next', { n: game.round + 2, total: game.totalRounds })}
              </button>
            ) : (
              <p className="hint-line">{t('game.waitHostNext', { name: hostName })}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const ranked = [...participants].sort((a, b) => b.score - a.score || a.id - b.id);
  const topScore = ranked[0]?.score ?? 0;
  const winners = ranked.filter((player) => player.score === topScore);

  return (
    <div className="app">
      {header}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="screen-center final">
        <p className="eyebrow">{t('common.final')}</p>
        <h1>
          {winners.length > 1
            ? t('final.tie')
            : t('final.wins', { name: winners[0]?.name ?? t('game.playerFallback') })}
        </h1>
        <div className="panel final-board">
          <div className="score-list">
            {ranked.map((player, index) => (
              <div key={player.id} className="score-row">
                <span className="score-name">
                  <span
                    className="swatch small-swatch"
                    style={{ background: player.color }}
                  />
                  <span>
                    {index + 1}. {player.name}
                  </span>
                </span>
                <span className="score-value">{player.score}</span>
              </div>
            ))}
          </div>
          {isHost ? (
            <div className="button-row">
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => send('game:rematch', null)}
              >
                {t('final.rematch')}
              </button>
              <button
                className="ghost"
                type="button"
                disabled={busy}
                onClick={() => send('game:lobby', null)}
              >
                {t('game.backLobby')}
              </button>
            </div>
          ) : (
            <p className="hint-line">{t('game.waitHostNew', { name: hostName })}</p>
          )}
        </div>
      </div>
    </div>
  );
}
