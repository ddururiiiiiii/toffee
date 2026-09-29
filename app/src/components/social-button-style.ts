import type { SocialProvider } from '@/lib/social-types';

// 각 회사 로그인 버튼 색(브랜드 가이드) — 공식 로고 이미지는 콘솔 등록 때 받아서 교체. 앱·웹 버튼이 같이 씀
export const PROVIDER_STYLE: Record<SocialProvider, { background: string; text: string; border?: string }> = {
  apple: { background: '#000000', text: '#FFFFFF', border: 'rgba(255,255,255,0.35)' },
  google: { background: '#FFFFFF', text: '#1F1F1F' },
  line: { background: '#06C755', text: '#FFFFFF' },
  kakao: { background: '#FEE500', text: '#191919' },
  naver: { background: '#03C75A', text: '#FFFFFF' },
};

// 나라마다 많이 쓰는 로그인을 위로 — 한국어면 카카오·네이버, 그 외(태국·일본·대만)는 LINE
export function orderedProviders(providers: SocialProvider[], language: string): SocialProvider[] {
  const order: SocialProvider[] = language.startsWith('ko') ? ['kakao', 'naver', 'apple', 'google', 'line'] : ['line', 'apple', 'google', 'kakao', 'naver'];
  return order.filter((provider) => providers.includes(provider));
}
