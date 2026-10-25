import { useLang } from './Lang';
import { normalizeSettings, type Settings } from './game';
import type { StringKey } from './i18n';

const SUMMARY_KEYS: [keyof Settings, StringKey][] = [
  ['hideFirstPawns', 'settings.summary.hidden'],
  ['grayPawns', 'settings.summary.anon'],
  ['voteSecondCue', 'settings.summary.vote'],
  ['oneCue', 'settings.summary.oneCue'],
  ['twoLaps', 'settings.summary.twoLaps'],
  ['hideScores', 'settings.summary.secret'],
  ['shuffledGivers', 'settings.summary.shuffled'],
];

function settingsSummary(settings: Settings, t: (key: StringKey) => string): string {
  const parts = SUMMARY_KEYS.filter(([flag]) => settings[flag]).map(([, key]) => t(key));
  return parts.length ? parts.join(' · ') : t('settings.summary.standard');
}

const ROWS: { flag: keyof Settings; off?: (s: Settings) => boolean; title: StringKey; desc: StringKey }[] = [
  { flag: 'hideFirstPawns', title: 'settings.hidePawns.title', desc: 'settings.hidePawns.desc' },
  { flag: 'grayPawns', off: (s) => !s.hideFirstPawns, title: 'settings.anonPawns.title', desc: 'settings.anonPawns.desc' },
  { flag: 'voteSecondCue', off: (s) => s.oneCue, title: 'settings.vote.title', desc: 'settings.vote.desc' },
  { flag: 'oneCue', title: 'settings.oneCue.title', desc: 'settings.oneCue.desc' },
  { flag: 'twoLaps', title: 'settings.twoLaps.title', desc: 'settings.twoLaps.desc' },
  { flag: 'hideScores', title: 'settings.secret.title', desc: 'settings.secret.desc' },
  { flag: 'shuffledGivers', title: 'settings.shuffle.title', desc: 'settings.shuffle.desc' },
];

function SettingsPanel({
  settings,
  onChange,
  disabled = false,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  disabled?: boolean;
}) {
  const { t } = useLang();
  const set = (patch: Partial<Settings>) =>
    onChange(normalizeSettings({ ...settings, ...patch }));

  return (
    <div className={`settings-list${disabled ? ' readonly' : ''}`}>
      {ROWS.map(({ flag, off, title, desc }) => {
        const locked = off?.(settings) === true;
        return (
          <label key={flag} className={`setting${locked ? ' off' : ''}`}>
            <input
              type="checkbox"
              checked={settings[flag]}
              disabled={disabled || locked}
              onChange={(event) => set({ [flag]: event.target.checked })}
            />
            <span>
              <b>{t(title)}</b>
              <small>{t(desc)}</small>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function OptionsMenu({
  settings,
  onChange,
  canEdit,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  canEdit: boolean;
}) {
  const { t } = useLang();
  return (
    <details className="options">
      <summary>
        <span>{t('settings.options')}</span>
        <span className="options-state">{settingsSummary(settings, t)}</span>
      </summary>
      {!canEdit ? <p className="hint-line options-note">{t('lobby.onlyHost')}</p> : null}
      <SettingsPanel settings={settings} onChange={onChange} disabled={!canEdit} />
    </details>
  );
}
