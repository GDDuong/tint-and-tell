import { useLang } from './Lang';
import type { VoiceStatus } from './voice';

type Props = {
  status: VoiceStatus;
  muted: boolean;
  deafened: boolean;
  onMute: (muted: boolean) => void;
  onDeafen: (deafened: boolean) => void;
};

export function VoiceControls({ status, muted, deafened, onMute, onDeafen }: Props) {
  const { t } = useLang();
  const problem = status === 'failed' ? t('voice.failed') : '';
  const micLabel = problem || (muted ? t('voice.unmute') : t('voice.mute'));
  const deafLabel = problem || (deafened ? t('voice.undeafen') : t('voice.deafen'));
  return (
    <>
      <button
        className="sound-btn"
        type="button"
        aria-pressed={!muted}
        aria-label={micLabel}
        title={micLabel}
        onClick={() => onMute(!muted)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="10" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
          {muted ? <path d="m4 4 16 16" /> : null}
        </svg>
      </button>
      <button
        className="sound-btn"
        type="button"
        aria-pressed={!deafened}
        aria-label={deafLabel}
        title={deafLabel}
        onClick={() => onDeafen(!deafened)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 14v-1a8 8 0 0 1 16 0v1" />
          <rect x="3" y="14" width="4" height="6" rx="1.5" />
          <rect x="17" y="14" width="4" height="6" rx="1.5" />
          {deafened ? <path d="m4 4 16 16" /> : null}
        </svg>
      </button>
    </>
  );
}
