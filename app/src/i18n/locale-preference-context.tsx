import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { loadPreference, savePreference } from '@/lib/preference-storage';

import i18n from './index';
import { getDeviceLanguage, isSupportedLanguage, type SupportedLanguage } from './languages';

const OVERRIDE_KEY = 'toffee_locale_override';

interface LocalePreferenceValue {
  /** 지금 적용 중인 언어 — 직접 고른 값이 있으면 그 값, 없으면 기기 언어 */
  locale: SupportedLanguage;
  /** 사용자가 직접 고른 값. null이면 "기기 언어 따르기" */
  override: SupportedLanguage | null;
  setOverride: (next: SupportedLanguage | null) => void;
}

const LocalePreferenceContext = createContext<LocalePreferenceValue | null>(null);

export function LocalePreferenceProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<SupportedLanguage | null>(null);

  useEffect(() => {
    void loadPreference(OVERRIDE_KEY).then((stored) => {
      if (stored && isSupportedLanguage(stored)) setOverrideState(stored);
    });
  }, []);

  const locale = override ?? getDeviceLanguage();

  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale]);

  const setOverride = useCallback((next: SupportedLanguage | null) => {
    setOverrideState(next);
    void savePreference(OVERRIDE_KEY, next);
  }, []);

  const value = useMemo(() => ({ locale, override, setOverride }), [locale, override, setOverride]);
  return <LocalePreferenceContext.Provider value={value}>{children}</LocalePreferenceContext.Provider>;
}

export function useLocalePreference(): LocalePreferenceValue {
  const value = useContext(LocalePreferenceContext);
  if (!value) throw new Error('useLocalePreference must be used within LocalePreferenceProvider');
  return value;
}
