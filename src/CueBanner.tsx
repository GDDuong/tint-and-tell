import { useLang } from './Lang';

export function CueBanner({ cue1, cue2 }: { cue1: string; cue2?: string }) {
  const { t } = useLang();
  return (
    <div className="cue-banner">
      <div className="cue-value">
        <span>{t('cueBanner.cue1')}</span>
        <strong>{cue1}</strong>
      </div>
      {cue2 ? (
        <div className="cue-value">
          <span>{t('cueBanner.cue2')}</span>
          <strong>{cue2}</strong>
        </div>
      ) : null}
    </div>
  );
}
