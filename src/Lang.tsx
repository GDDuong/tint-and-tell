import { createContext, useContext, useState, type ReactNode } from 'react';
import { translate, type Lang, type StringKey, type Vals } from './i18n';

const LangContext = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
}>({ lang: 'en', setLang: () => {} });

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('tint-lang');
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {
    // Private browsing can refuse storage.
  }
  return 'vi';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem('tint-lang', next);
    } catch {
      // Private browsing can refuse storage; the pick still applies for this session.
    }
  };
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const { lang, setLang } = useContext(LangContext);
  return { lang, setLang, t: (key: StringKey, vals?: Vals) => translate(lang, key, vals) };
}

export function LangToggle() {
  const { lang, setLang, t } = useLang();
  return (
    <select
      className="lang-toggle"
      value={lang}
      onChange={(event) => setLang(event.target.value as Lang)}
      aria-label={t('lang.label')}
    >
      <option value="en">English</option>
      <option value="vi">Tiếng Việt</option>
    </select>
  );
}
