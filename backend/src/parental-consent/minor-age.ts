/**
 * 법정대리인(부모) 동의가 필요한 나이 기준 — 국가별(잠정, STATUS.md "출시 전 확정할 정책", 👤 변호사 확정).
 * "만 N세 미만이면 동의 필요"의 N. 한국은 개인정보보호법 만 14세, 태국은 PDPA상 미성년(만 20세 미만)이라 20.
 * 목록에 없는 나라·국가를 모르는 경우는 가장 엄격한 값으로.
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
