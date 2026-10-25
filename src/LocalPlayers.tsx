import { useEffect, useRef, useState } from 'react';
import { ColorDots } from './ColorDots';
import { useLang } from './Lang';
import { PLAYER_COLORS, type Player } from './game';

function NameField({
  name,
  label,
  onRename,
}: {
  name: string;
  label: string;
  onRename: (name: string) => void;
}) {
  const [value, setValue] = useState(name);

  const commit = () => {
    const clean = value.trim().slice(0, 16);
    if (!clean) {
      setValue(name);
      return;
    }
    setValue(clean);
    if (clean !== name) onRename(clean);
  };

  return (
    <input
      value={value}
      maxLength={16}
      aria-label={label}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        commit();
        event.currentTarget.blur();
      }}
    />
  );
}

export function LocalPlayers({
  players,
  onRename,
  onColor,
}: {
  players: Player[];
  onRename: (id: number, name: string) => void;
  onColor: (id: number, color: string) => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [colorId, setColorId] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setColorId(null);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div className="local-players" ref={ref}>
      <button
        className="ghost small-btn"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {t('local.players')}
      </button>
      {open ? (
        <div className="panel popover" role="dialog" aria-label={t('local.players')}>
          <p className="panel-title">{t('local.players')}</p>
          <p className="hint-line">{t('local.hint')}</p>
          <div className="players">
            {players.map((player) => (
              <div className="player-block" key={player.id}>
                <div className="player-row">
                  <button
                    className="swatch-btn"
                    type="button"
                    onClick={() => setColorId(colorId === player.id ? null : player.id)}
                    aria-label={t('color.change')}
                    aria-expanded={colorId === player.id}
                  >
                    <span className="swatch" style={{ background: player.color }} />
                  </button>
                  <NameField
                    name={player.name}
                    label={t('setup.nameLabel', { n: player.id + 1 })}
                    onRename={(name) => onRename(player.id, name)}
                  />
                </div>
                {colorId === player.id ? (
                  <ColorDots
                    value={Math.max(0, PLAYER_COLORS.indexOf(player.color))}
                    used={players
                      .filter((entry) => entry.id !== player.id)
                      .map((entry) => PLAYER_COLORS.indexOf(entry.color))}
                    onPick={(color) => onColor(player.id, PLAYER_COLORS[color])}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
