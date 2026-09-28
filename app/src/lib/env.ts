export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// 고객센터 문의 이메일 — 회사용 주소를 만들면 넣기(ops-infra-backlog). 비어 있으면 "문의하기"는 준비 중으로 표시.
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '';
