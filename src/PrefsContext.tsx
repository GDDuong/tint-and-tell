import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { applyTheme, loadPrefs, savePrefs, type Prefs } from './prefs';
import { setSfxVolume } from './sfx';

const PrefsContext = createContext<{ prefs: Prefs; update: (patch: Partial<Prefs>) => void }>({
  prefs: loadPrefs(),
  update: () => {},
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  useEffect(() => applyTheme(prefs.theme), [prefs.theme]);
  useEffect(() => {
    setSfxVolume((prefs.masterVol / 100) * (prefs.sfxVol / 100));
  }, [prefs.masterVol, prefs.sfxVol]);
  const update = (patch: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      savePrefs(next);
      return next;
    });
  };
  return <PrefsContext.Provider value={{ prefs, update }}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  return useContext(PrefsContext);
}
