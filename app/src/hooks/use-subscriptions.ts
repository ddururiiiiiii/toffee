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
