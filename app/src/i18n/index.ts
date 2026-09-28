import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { FALLBACK_LANGUAGE, getDeviceLanguage } from './languages';
import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import th from './locales/th.json';
import zhHans from './locales/zh-Hans.json';
import zhHant from './locales/zh-Hant.json';

// 번역 원본은 ko.json — 새 문구는 ko에 먼저 추가하고 나머지 언어에도 같은 키를 넣을 것
// (빠진 키는 영어로 표시됨). th/ja/zh는 원어민 검수 전(2026-09-28 기계 번역).
// 운영자(ADMIN) 화면과 약관/개인정보처리방침 본문은 의도적으로 한국어만 둠 — 기능 문서 참고.
// eslint-disable-next-line import/no-named-as-default-member -- i18next 기본 export 체이닝(.use)은 named export `use`와 무관한 오탐.
void i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    th: { translation: th },
    en: { translation: en },
    ja: { translation: ja },
    'zh-Hans': { translation: zhHans },
    'zh-Hant': { translation: zhHant },
  },
  lng: getDeviceLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
