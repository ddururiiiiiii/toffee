import { getLocales } from 'expo-localization';

// 백엔드(backend/src/common/i18n/locales.ts)와 같은 목록을 유지할 것.
// 베트남어는 2026-10-02 1차에 추가(태국 GL 팬미팅이 열리는 나라). 중국어는 대상이 해외 화교권이라 번체(대만·홍콩·마카오)와 간체(말레이시아·싱가포르)를 나눔.
export const SUPPORTED_LANGUAGES = ['ko', 'th', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'vi'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// 지원하지 않는 기기 언어는 영어로 — 글로벌 팬 기본값
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

// 언어 선택 화면에 보여줄 이름 — 항상 그 언어 자신의 표기로(번역하지 않음)
export const LANGUAGE_NATIVE_NAMES: Record<SupportedLanguage, string> = {
  ko: '한국어',
  th: 'ไทย',
  en: 'English',
  ja: '日本語',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  vi: 'Tiếng Việt',
};

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

const TRADITIONAL_CHINESE_REGIONS = new Set(['TW', 'HK', 'MO']);

/** 기기 언어 → 지원 언어. 중국어는 스크립트(Hant/Hans) 우선, 없으면 지역으로 번체/간체 판단. */
export function getDeviceLanguage(): SupportedLanguage {
  const locale = getLocales()[0];
  const code = locale?.languageCode?.toLowerCase();
  if (!code) return FALLBACK_LANGUAGE;
  if (code === 'zh') {
    const script = locale.languageScriptCode;
    if (script === 'Hant') return 'zh-Hant';
    if (script === 'Hans') return 'zh-Hans';
    return TRADITIONAL_CHINESE_REGIONS.has(locale.regionCode ?? '') ? 'zh-Hant' : 'zh-Hans';
  }
  return isSupportedLanguage(code) ? code : FALLBACK_LANGUAGE;
}
