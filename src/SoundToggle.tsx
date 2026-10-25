import { useLang } from './Lang';

export function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const { t } = useLang();
  const label = on ? t('sound.mute') : t('sound.unmute');
  return (
    <button
      className="icon-btn sound-btn"
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      title={label}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M11 5 6 9H3v6h3l5 4z" />
        {on ? (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </>
        ) : (
          <>
            <path d="m16 9 5 6" />
            <path d="m21 9-5 6" />
          </>
        )}
      </svg>
    </button>
  );
}
