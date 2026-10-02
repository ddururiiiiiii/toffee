import type { SocialProvider } from '@/lib/social-types';

// 각 회사 로그인 버튼 색(브랜드 가이드) — 공식 로고 이미지는 콘솔 등록 때 받아서 교체. 앱·웹 버튼이 같이 씀
export const PROVIDER_STYLE: Record<SocialProvider, { background: string; text: string; border?: string }> = {
  apple: { background: '#000000', text: '#FFFFFF', border: 'rgba(255,255,255,0.35)' },
  google: { background: '#FFFFFF', text: '#1F1F1F' },
  line: { background: '#06C755', text: '#FFFFFF' },
  kakao: { background: '#FEE500', text: '#191919' },
  naver: { background: '#03C75A', text: '#FFFFFF' },
};

// 나라마다 많이 쓰는 로그인을 위로(2026-10-02 사용자 결정) — 한국어: 카카오 → 네이버 → 구글 → 애플 → LINE,
// 그 외(태국·일본·대만 등): LINE → 구글 → 애플. 카카오·네이버는 한국 밖에선 거의 안 써서 한국어 화면에서만 보임
export function orderedProviders(providers: SocialProvider[], language: string): SocialProvider[] {
  const order: SocialProvider[] = language.startsWith('ko') ? ['kakao', 'naver', 'google', 'apple', 'line'] : ['line', 'google', 'apple'];
  return order.filter((provider) => providers.includes(provider));
}
