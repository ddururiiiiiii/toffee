import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useLiveInterval } from '@/lib/realtime';
import { useAuth } from '@/lib/auth-context';

export interface Subscription {
  id: string;
  actorId: string;
  startedAt: string;
  lastArtistMessageAt: string | null;
  lastFanReplyAt: string | null;
  cancelledAt: string | null;
  // 이 배우 알림 끄기(채팅방 🔔)
  notificationsMuted: boolean;
  actor: { id: string; chatDisplayName: string; chatProfileImageUrl: string | null; monthlyPriceCents: number };
  /** 이 방을 열어 주는 구매 — 개인 구독(bundle null) 또는 묶음. 묶음으로만 열렸으면 해지는 묶음 단위 */
  coveredBy: { purchaseId: string; iapPlatform?: 'IOS' | 'ANDROID' | null; bundle: { id: string; name: string; priceCents: number } | null }[];
  /** 마지막으로 채팅방을 본 뒤 온 스타 메시지 수 */
  unreadCount: number;
  /** 인박스 미리보기(서버가 최근 대화 순으로 정렬해서 줌) */
  lastMessage: {
    senderType: 'ARTIST' | 'FAN';
    mediaType: 'TEXT' | 'PHOTO' | 'AUDIO' | 'VIDEO';
    body: string | null;
    createdAt: string;
  } | null;
}

/** 내 구독 = 인박스 목록. live면 인박스를 보고 있는 동안 주기적으로 새로고침(새 메시지·안 읽음 반영) */
export function useMySubscriptions(options: { live?: boolean } = {}) {
  const { token } = useAuth();
  const interval = useLiveInterval(10000);
  return useQuery({
    queryKey: ['my-subscriptions'],
    queryFn: () => apiClient.get<Subscription[]>('/me/subscriptions'),
    enabled: !!token,
    refetchInterval: options.live ? interval : false,
  });
}

interface SubscribeResult {
  subscription: { id: string; actorId: string };
  basePriceCents: number;
  effectivePriceCents: number;
  bundleDiscountApplied: boolean;
}

export function useSubscribe(actorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<SubscribeResult>(`/actors/${actorId}/subscribe`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
    },
  });
}

export function useUnsubscribe(actorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/actors/${actorId}/subscribe`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
    },
  });
}

// 배우별 알림 끄기/켜기 — 화면이 바로 바뀌게 목록 캐시를 먼저 고침
export function useSetNotificationsMuted(actorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (muted: boolean) => apiClient.patch(`/actors/${actorId}/subscribe/notifications`, { muted }),
    onMutate: (muted) => {
      queryClient.setQueryData<Subscription[]>(['my-subscriptions'], (list) =>
        list?.map((s) => (s.actorId === actorId ? { ...s, notificationsMuted: muted } : s)),
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] }),
  });
}


/** 환불 요청(2026-09-29) — 스타 미발송(이용 기간 동안 스타 메시지 0개, 기간 끝난 뒤 7일 안), 활동 종료(결제 후 14일 안에 배우 활동 종료) */
export interface RefundCandidate {
  chargeId: string;
  reason: 'STAR_IDLE' | 'ACTOR_RETIRED';
  productName: string;
  amountCents: number;
  currency: string;
  chargedAt: string;
  periodEnd: string;
  /** 활동 종료 사유면 종료된 때 */
  endedAt: string | null;
  deadline: string;
  source: 'SANDBOX' | 'APPLE' | 'GOOGLE';
  /** 애플 결제를 이미 안내받았으면 STORE_GUIDED */
  requested: 'REFUNDED' | 'STORE_GUIDED' | null;
}

export function useRefundCandidates() {
  return useQuery({ queryKey: ['refunds'], queryFn: () => apiClient.get<RefundCandidate[]>('/me/refunds') });
}

export function useRequestRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chargeId: string) => apiClient.post<{ status: 'REFUNDED' | 'STORE_GUIDED'; url?: string }>(`/me/refunds/${chargeId}`),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['refunds'] }),
  });
}
