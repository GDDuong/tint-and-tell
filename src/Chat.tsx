import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { GameView } from '../server/game.ts';
import type { RoomView } from '../server/rooms.ts';
import { useLang } from './Lang';
import { CHAT_MAX } from './game';
import { translateServerError } from './i18n';
import { socket } from './socket';

type Reply = { ok: true } | { ok: false; error: string };

export function Chat({
  room,
  youId,
  game,
}: {
  room: RoomView;
  youId: number;
  game: GameView | null;
}) {
  const { lang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const lastId = room.chat[room.chat.length - 1]?.id ?? 0;
  const [seenId, setSeenId] = useState(lastId);
  const listRef = useRef<HTMLDivElement>(null);
  const unread = room.chat.filter((message) => message.id > seenId).length;
  const muted =
    game != null &&
    game.giverId === youId &&
    game.phase !== 'reveal' &&
    game.phase !== 'final';

  useEffect(() => {
    const list = listRef.current;
    if (open && list) list.scrollTop = list.scrollHeight;
  }, [open, room.chat.length]);

  function toggle() {
    setSeenId(lastId);
    setError('');
    setOpen((value) => !value);
  }

  function send(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    setText('');
    setError('');
    socket.emit('chat:send', { text: message }, (reply: Reply) => {
      if (!reply?.ok) {
        setError(translateServerError(lang, reply?.error ?? t('chat.failed')));
        setText(message);
      }
    });
  }

  return (
    <>
      <button className="ghost small-btn" type="button" onClick={toggle} aria-expanded={open}>
        {t('chat.button')}
        {!open && unread > 0 ? <span className="chat-badge">{unread}</span> : null}
      </button>
      {open ? (
        <section className="chat-panel" aria-label={t('chat.title')}>
          <div className="chat-head">
            <b>{t('chat.title')}</b>
            <button className="ghost small-btn" type="button" onClick={toggle} aria-label={t('chat.close')}>
              ×
            </button>
          </div>
          <div className="chat-list" ref={listRef} aria-live="polite">
            {room.chat.length === 0 ? <p className="hint-line">{t('chat.empty')}</p> : null}
            {room.chat.map((message) => (
              <div
                className={`chat-msg${message.playerId === youId ? ' mine' : ''}`}
                key={message.id}
              >
                <span className="chat-name">
                  {message.playerId === youId ? t('chat.you') : message.name}
                </span>
                <span className="chat-text">{message.text}</span>
              </div>
            ))}
          </div>
          {error ? <p className="error chat-error">{error}</p> : null}
          {muted ? (
            <p className="chat-muted">{t('chat.muted')}</p>
          ) : (
            <form className="chat-form" onSubmit={send}>
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={CHAT_MAX}
                placeholder={t('chat.placeholder')}
                aria-label={t('chat.placeholder')}
                autoComplete="off"
              />
              <button type="submit" disabled={!text.trim()}>
                {t('chat.send')}
              </button>
            </form>
          )}
          <p className="chat-note">{t('chat.note')}</p>
        </section>
      ) : null}
    </>
  );
}
