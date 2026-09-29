import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface LegalSection {
  title: string;
  body: string;
}

/**
 * 이용약관·개인정보처리방침 본문 — 서버가 원본(backend/src/legal/legal-texts.ts, 2026-09-29). 같은 글이 공개 웹페이지
 * (GET /legal/terms 등, 스토어 등록용)로도 나가서 앱과 웹이 어긋나지 않게. 로그인 전에도 볼 수 있음.
 */
export function useLegalSections(doc: 'terms' | 'privacy') {
  return useQuery({
    queryKey: ['legal', doc],
    queryFn: () => apiClient.get<{ version: string; sections: LegalSection[] }>(`/legal/${doc}/sections`),
    staleTime: 60 * 60 * 1000,
  });
}
