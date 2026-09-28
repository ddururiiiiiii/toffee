import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface AgencySummary {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface Agency extends AgencySummary {
  actorCount: number;
}

export interface Actor {
  id: string;
  legalName: string;
  officialProfileImageUrl: string | null;
  chatDisplayName: string;
  chatProfileImageUrl: string | null;
  monthlyPriceCents: number;
  createdAt?: string;
  /** 활동 종료한 배우(목록엔 안 나오고, 프로필 링크로 들어오면 신규 구독 대신 안내) */
  retiredAt?: string | null;
  // 무소속이면 null
  agency: AgencySummary | null;
}

// q는 서버에서 배우 이름 + 소속사 이름 둘 다에 매칭됨
export type ActorSort = 'trending' | 'new';

export function useActors(query: string, agencyId?: string | null, sort?: ActorSort) {
  return useQuery({
    queryKey: ['actors', { query, agencyId: agencyId ?? null, sort: sort ?? null }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (agencyId) params.set('agencyId', agencyId);
      if (sort) params.set('sort', sort);
      const search = params.toString();
      return apiClient.get<Actor[]>(`/actors${search ? `?${search}` : ''}`);
    },
  });
}

export function useAgencies() {
  return useQuery({
    queryKey: ['agencies'],
    queryFn: () => apiClient.get<Agency[]>('/agencies'),
  });
}

export function useActor(id: string) {
  return useQuery({
    queryKey: ['actors', id],
    queryFn: () => apiClient.get<Actor>(`/actors/${id}`),
    enabled: !!id,
  });
}
