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
  /** 개인 구독 스토어 상품 ID — 없으면 아직 스토어 결제 불가(테스트 구독만) */
  storeProductId?: string | null;
  createdAt?: string;
  /** 활동 종료한 배우(목록엔 안 나오고, 프로필 링크로 들어오면 신규 구독 대신 안내) */
  retiredAt?: string | null;
  // 무소속이면 null
  agency: AgencySummary | null;
  /** 1인 방 / 커플방(2026-09-29) — 커플방은 소속사가 없고 멤버 배우 2명 */
  kind?: 'SOLO' | 'COUPLE';
  /** 성별(둘러보기 여성·남성 줄) — 커플방·지정 안 함은 null */
  gender?: ArtistGender | null;
  coupleMembers?: { member: CoupleMemberActor }[];
}

export interface CoupleMemberActor {
  id: string;
  legalName: string;
  chatDisplayName: string;
  officialProfileImageUrl: string | null;
  chatProfileImageUrl: string | null;
  retiredAt: string | null;
}

/** 커플방 멤버 배우들(1인 방이면 빈 배열) */
export const membersOf = (actor: Pick<Actor, 'coupleMembers'>): CoupleMemberActor[] => actor.coupleMembers?.map(({ member }) => member) ?? [];

// q는 서버에서 아티스트 공식 이름 + 소속사 이름 둘 다에 매칭됨. 서버는 인기순(trending)도 받지만 둘러보기에선 안 씀(2026-10-02 사용자 결정)
export type ActorSort = 'new';
export type ArtistGender = 'FEMALE' | 'MALE';

export interface ActorListParams {
  query?: string;
  agencyId?: string | null;
  sort?: ActorSort;
  /** SOLO(기본) / COUPLE / ALL(둘 다 — "새로 온 아티스트·CP", 검색) */
  kind?: 'SOLO' | 'COUPLE' | 'ALL';
  gender?: ArtistGender;
  enabled?: boolean;
}

export function useActors({ query, agencyId, sort, kind, gender, enabled = true }: ActorListParams) {
  return useQuery({
    queryKey: ['actors', { query: query ?? '', agencyId: agencyId ?? null, sort: sort ?? null, kind: kind ?? null, gender: gender ?? null }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (agencyId) params.set('agencyId', agencyId);
      if (sort) params.set('sort', sort);
      if (kind) params.set('kind', kind);
      if (gender) params.set('gender', gender);
      const search = params.toString();
      return apiClient.get<Actor[]>(`/actors${search ? `?${search}` : ''}`);
    },
    enabled,
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

/** 둘러보기 "커플방" 줄 — 활동 중인 커플방 전체 */
export function useCoupleRooms() {
  return useQuery({ queryKey: ['actors', 'couples'], queryFn: () => apiClient.get<Actor[]>('/actors?kind=COUPLE') });
}

/** 이 배우가 든 커플방(배우 프로필) */
export function useActorCouples(actorId: string, enabled = true) {
  return useQuery({
    queryKey: ['actors', actorId, 'couples'],
    queryFn: () => apiClient.get<Actor[]>(`/actors/${actorId}/couples`),
    enabled: !!actorId && enabled,
  });
}

