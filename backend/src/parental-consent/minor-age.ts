/**
 * 가입 연령 기준 — 국가별(잠정, STATUS.md "출시 전 확정할 정책", 👤 변호사 확정). 가입 때 저장한 기기 지역(User.countryCode) 기준.
 * 목록에 없는 나라·국가를 모르는 경우는 가장 엄격한 값으로.
 */

/**
 * 성인만 가입(ADULTS_ONLY, 2026-09-29 사용자 결정 — 기본값)일 때: "만 N세 미만이면 가입 불가"의 N = 그 나라 성년 나이.
 * 한국 만 19세(민법), 태국 만 20세(민상법), 일본·대만·홍콩·말레이시아·중국 만 18세, 싱가포르 만 21세(계약 기준).
 */
export const ADULT_AGE_BY_COUNTRY: Readonly<Record<string, number>> = {
  KR: 19,
  TH: 20,
  JP: 18,
  TW: 18,
  HK: 18,
  MO: 18,
  MY: 18,
  CN: 18,
  SG: 21,
};
export const DEFAULT_ADULT_AGE = 20;

export function adultAgeFor(countryCode: string | null | undefined): number {
  return (countryCode && ADULT_AGE_BY_COUNTRY[countryCode.toUpperCase()]) || DEFAULT_ADULT_AGE;
}

/**
 * 부모 동의 방식(ADULTS_ONLY=false로 되돌릴 때만 씀): "만 N세 미만이면 법정대리인 동의 필요"의 N.
 * 한국은 개인정보보호법 만 14세, 태국은 PDPA상 미성년(만 20세 미만)이라 20.
 */
export const CONSENT_AGE_BY_COUNTRY: Readonly<Record<string, number>> = {
  KR: 14,
  TH: 20,
};
export const DEFAULT_CONSENT_AGE = 20;

export function consentAgeFor(countryCode: string | null | undefined): number {
  return (countryCode && CONSENT_AGE_BY_COUNTRY[countryCode.toUpperCase()]) || DEFAULT_CONSENT_AGE;
}

/** 앱이 보낸 국가 코드 정리 — 두 글자 영문만 인정(그 외는 모름 처리) */
export function normalizeCountryCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}
