import { useEffect, useRef, useState } from 'react';
import { LangToggle, useLang } from './Lang';
import { usePrefs } from './PrefsContext';

function Slider({
  label,
  value,
  max = 100,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="set-field">
      <span className="set-row">
        <span>{label}</span>
        <output>{value}%</output>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

let askedForLabels = false;

export function AppSettings() {
  const { t } = useLang();
  const { prefs, update } = usePrefs();
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [listening, setListening] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const media = navigator.mediaDevices;
    // Browsers hide device names until mic access is granted; ask once per page load.
    const load = () => {
      void media
        ?.enumerateDevices()
        .then((list) => {
          if (!alive) return;
          setDevices(list);
          if (askedForLabels || !list.some((device) => device.kind === 'audioinput' && !device.label)) {
            return;
          }
          askedForLabels = true;
          void media
            .getUserMedia({ audio: true })
            .then((stream) => {
              stream.getTracks().forEach((track) => track.stop());
              return media.enumerateDevices();
            })
            .then((next) => {
              if (alive) setDevices(next);
            })
            .catch(() => {});
        })
        .catch(() => {});
    };
    load();
    media?.addEventListener('devicechange', load);
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      alive = false;
      media?.removeEventListener('devicechange', load);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code !== 'Escape') update({ pttKey: event.code });
      setListening(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, update]);

  const inputs = devices.filter((device) => device.kind === 'audioinput');
  const outputs = devices.filter((device) => device.kind === 'audiooutput');
  const unnamed = (kind: string) => (kind === 'in' ? t('set.input.default') : t('set.output.default'));

  return (
    <div className="app-settings-wrap" ref={rootRef}>
      <button
        className="sound-btn"
        type="button"
        aria-expanded={open}
        aria-label={t('app.settings')}
        title={t('app.settings')}
        onClick={() => setOpen((value) => !value)}
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
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open ? (
        <div className="panel app-settings" role="dialog" aria-label={t('app.settings')}>
          <div className="settings-head">
            <span className="eyebrow">{t('app.settings')}</span>
            <button
              className="sound-btn settings-close"
              type="button"
              aria-label={t('app.close')}
              title={t('app.close')}
              onClick={() => setOpen(false)}
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <section>
            <h2 className="settings-section">{t('set.section.general')}</h2>
            <label className="set-field">
              <span>{t('set.theme')}</span>
              <select
                value={prefs.theme}
                onChange={(event) => update({ theme: event.target.value as 'dark' | 'light' })}
              >
                <option value="dark">{t('set.theme.dark')}</option>
                <option value="light">{t('set.theme.light')}</option>
              </select>
            </label>
            <label className="set-field">
              <span>{t('lang.label')}</span>
              <LangToggle />
            </label>
          </section>
          <section>
            <h2 className="settings-section">{t('set.section.voice')}</h2>
            <label className="set-field">
              <span>{t('set.voiceMode')}</span>
              <select
                value={prefs.voiceMode}
                onChange={(event) => update({ voiceMode: event.target.value as 'vad' | 'ptt' })}
              >
                <option value="vad">{t('set.voiceMode.vad')}</option>
                <option value="ptt">{t('set.voiceMode.ptt')}</option>
              </select>
            </label>
            <label className="set-field">
              <span>{t('set.input')}</span>
              <select value={prefs.inputId} onChange={(event) => update({ inputId: event.target.value })}>
                <option value="">{unnamed('in')}</option>
                {inputs.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `${t('set.input')} ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="set-field">
              <span>{t('set.output')}</span>
              <select
                value={prefs.outputId}
                onChange={(event) => update({ outputId: event.target.value })}
              >
                <option value="">{unnamed('out')}</option>
                {outputs.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `${t('set.output')} ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <Slider
              label={t('set.micSensitivity')}
              value={prefs.micSensitivity}
              disabled={prefs.voiceMode !== 'vad'}
              onChange={(value) => update({ micSensitivity: value })}
            />
            <div className="set-field">
              <div className="set-row">
                <span>{t('set.pttKey')}</span>
                <button
                  className={listening ? 'key-btn listening' : 'key-btn'}
                  type="button"
                  disabled={prefs.voiceMode !== 'ptt'}
                  onClick={() => setListening(true)}
                >
                  {listening ? t('set.pttKey.listen') : prefs.pttKey === '' ? t('set.pttKey.unset') : prefs.pttKey}
                </button>
              </div>
            </div>
            <Slider
              label={t('set.micBoost')}
              value={prefs.micBoost}
              max={200}
              onChange={(value) => update({ micBoost: value })}
            />
          </section>
          <section>
            <h2 className="settings-section">{t('set.section.volume')}</h2>
            <Slider label={t('set.master')} value={prefs.masterVol} onChange={(value) => update({ masterVol: value })} />
            <Slider label={t('set.sfx')} value={prefs.sfxVol} onChange={(value) => update({ sfxVol: value })} />
            <Slider label={t('set.voice')} value={prefs.voiceVol} onChange={(value) => update({ voiceVol: value })} />
          </section>
        </div>
      ) : null}
    </div>
  );
}
