// 앱(app/src/i18n)과 같은 목록을 유지할 것 — 중국어는 번체(대만·홍콩)/간체(말레이시아·싱가포르)를 분리.
export const SUPPORTED_LOCALES = ['ko', 'th', 'en', 'ja', 'zh-Hans', 'zh-Hant'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function resolveLocale(value: string | null | undefined): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? '') ? (value as SupportedLocale) : DEFAULT_LOCALE;
}
