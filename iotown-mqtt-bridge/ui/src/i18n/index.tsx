import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import en from "./en";
import ko, { type Messages } from "./ko";

export type Locale = "ko" | "en";

const MESSAGES: Record<Locale, Messages> = { ko, en };
const STORAGE_KEY = "bridge.locale";

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ko" || saved === "en") return saved;
  } catch {
    // Storage can be unavailable; fall back to Korean
  }
  return "ko";
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Messages;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: MESSAGES[locale],
      setLocale: (next) => {
        setLocaleState(next);
        document.documentElement.lang = next;
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Keep the choice for this page only
        }
      },
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n outside I18nProvider");
  return value;
}
