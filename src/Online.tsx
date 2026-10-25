import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { GameView } from '../server/game.ts';
import type { RoomView } from '../server/rooms.ts';
import { AppSettings } from './AppSettings';
import { Chat } from './Chat';
import { ColorDots } from './ColorDots';
import GameOnline from './GameOnline';
import { LangToggle, useLang } from './Lang';
import { usePrefs } from './PrefsContext';
import { OptionsMenu } from './SettingsPanel';
import { PLAYER_COLORS, type Settings } from './game';
import { translate, translateServerError } from './i18n';
import { SoundToggle } from './SoundToggle';
import { socket } from './socket';
import { VoiceControls } from './VoiceControls';
import { VoiceSession, type VoiceStatus } from './voice';

const MAX_PLAYERS = 8;

type Reply = { ok: true; youId: number; room: RoomView } | { ok: false; error: string };
type GameReply = { ok: true } | { ok: false; error: string };

export type VoiceState = {
  status: VoiceStatus;
  muted: boolean;
  deafened: boolean;
  setMuted: (muted: boolean) => void;
  setDeafened: (deafened: boolean) => void;
};

function useVoice(room: RoomView | null, youId: number | null): VoiceState {
  const { prefs } = usePrefs();
  const [status, setStatus] = useState<VoiceStatus>('connecting');
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const sessionRef = useRef<VoiceSession | null>(null);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
    sessionRef.current?.configure(prefs);
  });

  useEffect(() => {
    if (!room || youId == null) return;
    setStatus('connecting');
    const session = new VoiceSession(socket, youId, prefsRef.current, setStatus);
    sessionRef.current = session;
    void session.start(
      room.players.filter((player) => player.id !== youId).map((player) => ({ id: player.id, name: player.name })),
    );
    return () => {
      session.stop();
      if (sessionRef.current === session) sessionRef.current = null;
    };
    // One session per room; player joins/leaves are pushed via syncPlayers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code, youId]);

  useEffect(() => {
    if (!room || youId == null) return;
    sessionRef.current?.syncPlayers(
      room.players.filter((player) => player.id !== youId).map((player) => ({ id: player.id, name: player.name })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.players, youId]);

  useEffect(() => {
    sessionRef.current?.setMuted(muted);
  }, [muted, room?.code]);
  useEffect(() => {
    sessionRef.current?.setDeafened(deafened);
  }, [deafened, room?.code]);

  return { status, muted, deafened, setMuted, setDeafened };
}

export default function Online({
  onBack,
  soundOn,
  onToggleSound,
}: {
  onBack: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
}) {
  const { lang, t } = useLang();
  const { prefs, update } = usePrefs();
  const [name, setName] = useState(() => localStorage.getItem('tint-name') ?? '');
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [youId, setYouId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [copied, setCopied] = useState(false);
  const [modal, setModal] = useState<'leave' | 'disband' | null>(null);
  const [heir, setHeir] = useState<number | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const roomRef = useRef<RoomView | null>(null);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  const voice = useVoice(room, youId);

  useEffect(() => {
    const resetToJoin = (message: string, keepCode: boolean) => {
      const current = roomRef.current;
      roomRef.current = null;
      setRoom(null);
      setGame(null);
      setYouId(null);
      setBusy(false);
      setCopied(false);
      setModal(null);
      setCode(keepCode && current ? current.code : '');
      setError(message);
    };
    const onState = (state: RoomView) => {
      if (!roomRef.current) return;
      roomRef.current = state;
      setRoom(state);
    };
    const onDisconnect = () => {
      if (!roomRef.current) return;
      resetToJoin(tRef.current('online.error.lost'), true);
      setConnected(false);
    };
    const onKicked = () => resetToJoin(tRef.current('online.error.kicked'), true);
    const onClosed = () => resetToJoin(tRef.current('online.error.closed'), false);
    const onConnectError = () => {
      setBusy(false);
      setConnected(false);
      setError(tRef.current('online.error.unreachable'));
    };
    const onConnect = () => {
      setConnected(true);
      const unreachable = translate('en', 'online.error.unreachable');
      setError((current) =>
        current === unreachable || current === tRef.current('online.error.unreachable') ? '' : current,
      );
    };
    const onGame = (state: GameView | null) => {
      if (!roomRef.current) return;
      setGame(state);
    };

    socket.on('room:state', onState);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('connect', onConnect);
    socket.on('game:state', onGame);
    socket.on('room:kicked', onKicked);
    socket.on('room:closed', onClosed);
    socket.connect();

    return () => {
      if (roomRef.current) socket.emit('room:leave');
      socket.off('room:state', onState);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('connect', onConnect);
      socket.off('game:state', onGame);
      socket.off('room:kicked', onKicked);
      socket.off('room:closed', onClosed);
      socket.disconnect();
    };
  }, []);

  function accept(reply: Reply) {
    setBusy(false);
    if (!reply?.ok) {
      setError(translateServerError(lang, reply?.error ?? t('online.error.generic')));
      return;
    }
    roomRef.current = reply.room;
    setRoom(reply.room);
    setYouId(reply.youId);
  }

  function createRoom() {
    const clean = name.trim();
    if (!clean) return setError(t('err.nameFirst'));
    if (!socket.connected) return setError(t('online.error.notConnected'));
    localStorage.setItem('tint-name', clean);
    setBusy(true);
    setError('');
    setCopied(false);
    socket.emit('room:create', { name: clean }, accept);
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    const roomCode = code.trim().toUpperCase();
    if (!clean) return setError(t('err.nameFirst'));
    if (roomCode.length !== 4) return setError(t('online.error.code'));
    if (!socket.connected) return setError(t('online.error.notConnected'));
    localStorage.setItem('tint-name', clean);
    setBusy(true);
    setError('');
    setCopied(false);
    socket.emit('room:join', { code: roomCode, name: clean }, accept);
  }

  function leaveRoom(nextHostId?: number) {
    if (!roomRef.current) return;
    if (nextHostId != null) socket.emit('room:leave', { nextHostId });
    else socket.emit('room:leave');
    roomRef.current = null;
    setRoom(null);
    setGame(null);
    setYouId(null);
    setError('');
    setBusy(false);
    setCopied(false);
    setModal(null);
    setColorOpen(false);
  }

  function requestLeave() {
    const current = roomRef.current;
    if (!current) return onBack();
    if (current.hostId === youId && current.players.length > 1) {
      setHeir(current.players.find((player) => player.id !== youId)?.id ?? null);
      setModal('leave');
      return;
    }
    leaveRoom();
  }

  function requestDisband() {
    const current = roomRef.current;
    if (!current) return;
    if (current.players.length <= 1) return leaveRoom();
    setModal('disband');
  }

  function disbandRoom() {
    socket.emit('room:disband', (reply: GameReply) => {
      if (!reply?.ok) setError(translateServerError(lang, reply?.error ?? t('online.error.generic')));
    });
  }

  function kickPlayer(playerId: number) {
    setError('');
    socket.emit('room:kick', { playerId }, (reply: GameReply) => {
      if (!reply?.ok) setError(translateServerError(lang, reply?.error ?? t('online.error.generic')));
    });
  }

  function setSpectate(spectator: boolean) {
    setError('');
    socket.emit('room:spectate', { spectator }, (reply: GameReply) => {
      if (!reply?.ok) setError(translateServerError(lang, reply?.error ?? t('online.error.generic')));
    });
  }

  function changeColor(color: number) {
    setError('');
    socket.emit('room:color', { color }, (reply: GameReply) => {
      if (!reply?.ok) setError(translateServerError(lang, reply?.error ?? t('online.error.generic')));
    });
  }

  function startGame() {
    setBusy(true);
    setError('');
    socket.emit('game:start', (reply: GameReply) => {
      setBusy(false);
      if (!reply?.ok) setError(translateServerError(lang, reply?.error ?? t('online.error.generic')));
    });
  }

  function changeSettings(next: Settings) {
    setError('');
    socket.emit('room:settings', next, (reply: GameReply) => {
      if (!reply?.ok) setError(translateServerError(lang, reply?.error ?? t('online.error.rules')));
    });
  }

  function changeFirstGiver(playerId: number | null) {
    setError('');
    socket.emit('room:firstGiver', { playerId }, (reply: GameReply) => {
      if (!reply?.ok) setError(translateServerError(lang, reply?.error ?? t('online.error.firstGiver')));
    });
  }

  function back() {
    if (roomRef.current) {
      socket.emit('room:leave');
      roomRef.current = null;
      setGame(null);
    }
    onBack();
  }

  async function copyCode() {
    const current = roomRef.current;
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('online.error.copy'));
    }
  }

  const modalView =
    modal && room ? (
      <div className="modal-backdrop" role="presentation" onClick={() => setModal(null)}>
        <div
          className="panel modal"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          {modal === 'leave' ? (
            <>
              <p className="panel-title">{t('lobby.leaveQ')}</p>
              <p className="hint-line">{t('lobby.leaveHostHint')}</p>
              <label className="field">
                <span>{t('lobby.newHost')}</span>
                <select
                  value={heir ?? ''}
                  onChange={(event) => setHeir(Number(event.target.value))}
                >
                  {room.players
                    .filter((player) => player.id !== youId)
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.spectator ? `${player.name} · ${t('spectate.tag')}` : player.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="button-row">
                <button className="ghost" type="button" onClick={() => setModal(null)}>
                  {t('common.cancel')}
                </button>
                <button
                  className="primary"
                  type="button"
                  onClick={() => leaveRoom(heir ?? undefined)}
                >
                  {t('lobby.leave')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="panel-title">{t('lobby.disbandQ')}</p>
              <div className="button-row">
                <button className="ghost" type="button" onClick={() => setModal(null)}>
                  {t('common.cancel')}
                </button>
                <button className="danger" type="button" onClick={disbandRoom}>
                  {t('lobby.disband')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    ) : null;

  if (room && game && youId != null) {
    return (
      <>
        <GameOnline
          room={room}
          youId={youId}
          game={game}
          soundOn={soundOn}
          onToggleSound={onToggleSound}
          onLeave={requestLeave}
          onSpectate={() => setSpectate(true)}
          voice={voice}
        />
        {modalView}
      </>
    );
  }

  if (!room) {
    return (
      <div className="app setup-app online-app">
        <div className="topbar">
          <button className="ghost small-btn" type="button" onClick={back}>
            {t('online.back')}
          </button>
          <div className="topbar-right">
            <LangToggle />
            <SoundToggle on={soundOn} onToggle={onToggleSound} />
            <AppSettings />
          </div>
        </div>
        <header className="setup-hero online-hero">
          <div className="logo" aria-hidden="true">
            {PLAYER_COLORS.slice(0, 4).map((color) => (
              <i key={color} style={{ background: color }} />
            ))}
          </div>
          <p className="eyebrow">{t('online.eyebrow')}</p>
          <h1 className="hero-title online-title">{t('online.title')}</h1>
          <p className="hero-blurb">{t('online.blurb')}</p>
        </header>
        <div className="panel setup">
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              createRoom();
            }}
          >
            <label className="field">
              <span>{t('online.nameLabel')}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('online.nameLabel')}
                maxLength={16}
                autoComplete="nickname"
              />
            </label>
            <button
              className="primary wide"
              type="submit"
              disabled={busy || !name.trim() || !connected}
            >
              {busy ? t('online.connecting') : t('online.create')}
            </button>
          </form>

          <p className="online-or">{t('online.or')}</p>

          <form className="code-row" onSubmit={joinRoom}>
            <input
              value={code}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 4),
                )
              }
              placeholder="ABCD"
              maxLength={4}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label={t('lobby.code')}
            />
            <button type="submit" disabled={busy || !name.trim() || code.length !== 4 || !connected}>
              {t('online.join')}
            </button>
          </form>

          {!connected && !error ? (
            <p className="hint-line" role="status">
              {t('online.serverConnecting')}
            </p>
          ) : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="hint-line">{t('online.serverHint')}</p>
        </div>
      </div>
    );
  }

  const active = room.players.filter((player) => !player.spectator);
  const spectators = room.players.length - active.length;
  const you = room.players.find((player) => player.id === youId);

  return (
    <>
    <div className="app">
      <div className="topbar">
        <span className="wordmark">
          Tint <b>&</b> Tell
        </span>
        <div className="topbar-right">
          {youId != null ? <Chat room={room} youId={youId} game={null} /> : null}
          <VoiceControls
            status={voice.status}
            muted={voice.muted}
            deafened={voice.deafened}
            onMute={voice.setMuted}
            onDeafen={voice.setDeafened}
          />
          <LangToggle />
          <SoundToggle on={soundOn} onToggle={onToggleSound} />
          <AppSettings />
        </div>
      </div>
      <div className="screen-center lobby">
        <p className="eyebrow">{t('lobby.code')}</p>
        <h1 className="room-code">{room.code}</h1>
        <button className="ghost small-btn" type="button" onClick={copyCode}>
          {copied ? t('lobby.copied') : t('lobby.copy')}
        </button>

        <div className="panel lobby-panel">
          <p className="panel-title">
            {t('lobby.players', { count: active.length, max: MAX_PLAYERS })}
          </p>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="lobby-list" aria-live="polite">
            {room.players.map((player) => (
              <div className="lobby-row" key={player.id}>
                {player.id === youId ? (
                  <button
                    className="swatch-btn"
                    type="button"
                    onClick={() => setColorOpen((open) => !open)}
                    aria-label={t('color.change')}
                    aria-expanded={colorOpen}
                  >
                    <span className="swatch" style={{ background: PLAYER_COLORS[player.color] }} />
                  </button>
                ) : (
                  <span className="swatch" style={{ background: PLAYER_COLORS[player.color] }} />
                )}
                <span className="lobby-name">
                  {player.name}
                  {player.id === youId ? ` ${t('lobby.you')}` : ''}
                </span>
                {player.spectator ? <span className="watch-tag">{t('spectate.tag')}</span> : null}
                {player.id === room.hostId ? <span className="host-tag">{t('lobby.host')}</span> : null}
                {player.id !== youId ? (
                  <>
                    <input
                      className="vol-slider"
                      type="range"
                      min={0}
                      max={100}
                      value={prefs.playerVols[player.name] ?? 100}
                      aria-label={player.name}
                      title={`${player.name} · ${t('set.voice')}`}
                      onChange={(event) =>
                        update({
                          playerVols: {
                            ...prefs.playerVols,
                            [player.name]: Number(event.target.value),
                          },
                        })
                      }
                    />
                    {room.hostId === youId ? (
                      <button
                        className="kick-btn"
                        type="button"
                        onClick={() => kickPlayer(player.id)}
                        aria-label={t('lobby.kick', { name: player.name })}
                      >
                        ×
                      </button>
                    ) : null}
                  </>
                ) : null}
                {player.id === youId && colorOpen ? (
                  <ColorDots
                    value={player.color}
                    used={room.players
                      .filter((entry) => entry.id !== youId)
                      .map((entry) => entry.color)}
                    onPick={changeColor}
                  />
                ) : null}
              </div>
            ))}
          </div>
          {spectators > 0 ? (
            <p className="hint-line">{t('lobby.spectators', { count: spectators })}</p>
          ) : null}
          {you ? (
            <button
              className="ghost wide"
              type="button"
              onClick={() => setSpectate(!you.spectator)}
            >
              {you.spectator ? t('lobby.join') : t('lobby.spectate')}
            </button>
          ) : null}
          <label className="field">
            <span>{t('lobby.giverLabel')}</span>
            <select
              value={room.firstGiver ?? ''}
              disabled={room.hostId !== youId}
              onChange={(event) =>
                changeFirstGiver(event.target.value === '' ? null : Number(event.target.value))
              }
            >
              <option value="">{t('common.random')}</option>
              {active.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>
          <OptionsMenu
            settings={room.settings}
            onChange={changeSettings}
            canEdit={room.hostId === youId}
          />
          <p className="hint-line">{t('lobby.hint')}</p>
          {room.hostId === youId ? (
            <button
              className="primary wide"
              type="button"
              onClick={startGame}
              disabled={busy || active.length < 2}
            >
              {active.length < 2 ? t('lobby.waiting') : t('lobby.start')}
            </button>
          ) : (
            <p className="hint-line">{t('lobby.waitHost')}</p>
          )}
          <div className="button-row">
            <button className="ghost" type="button" onClick={requestLeave}>
              {t('lobby.leave')}
            </button>
            {room.hostId === youId ? (
              <button className="danger" type="button" onClick={requestDisband}>
                {t('lobby.disband')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
    {modalView}
    </>
  );
}
