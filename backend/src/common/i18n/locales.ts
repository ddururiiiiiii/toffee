// 앱(app/src/i18n)과 같은 목록을 유지할 것 — 중국어는 번체(대만·홍콩)/간체(말레이시아·싱가포르)를 분리.
export const SUPPORTED_LOCALES = ['ko', 'th', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'vi'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function resolveLocale(value: string | null | undefined): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? '') ? (value as SupportedLocale) : DEFAULT_LOCALE;
}

const TRADITIONAL_CHINESE_REGIONS = new Set(['tw', 'hk', 'mo']);

/**
 * Accept-Language 헤더 → 지원 언어. 앱은 지금 쓰는 언어 코드(ko, th, zh-Hant…)를 그대로 보내고, 브라우저에서
 * 직접 열면 "ko-KR,ko;q=0.9" 같은 값이 와서 첫 번째 항목만 봄. 중국어는 스크립트(Hant/Hans) 우선, 없으면 지역.
 */
export function localeFromAcceptLanguage(header: string | string[] | undefined): SupportedLocale {
  return matchAcceptLanguage(header) ?? DEFAULT_LOCALE;
}

/** 지원하는 언어면 그 언어, 아니면(없거나 프랑스어 등) null — 다른 단서(자녀 계정 언어)로 넘어갈 때 씀 */
export function matchAcceptLanguage(header: string | string[] | undefined): SupportedLocale | null {
  const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.split(';')[0]?.trim().toLowerCase();
  if (!first) return null;
  const [language, ...rest] = first.split('-');
  if (language === 'zh') {
    return rest.includes('hant') || rest.some((part) => TRADITIONAL_CHINESE_REGIONS.has(part)) ? 'zh-Hant' : 'zh-Hans';
  }
  return (SUPPORTED_LOCALES as readonly string[]).includes(language) ? (language as SupportedLocale) : null;
}
