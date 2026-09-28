import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
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
}

export function useMySubscriptions() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['my-subscriptions'],
    queryFn: () => apiClient.get<Subscription[]>('/me/subscriptions'),
    enabled: !!token,
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

