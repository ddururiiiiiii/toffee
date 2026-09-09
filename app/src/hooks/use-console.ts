import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Actor } from './use-actors';
import type { ChatMessage } from './use-messages';

export function useMyActors() {
  return useQuery({
    queryKey: ['my-actors'],
    queryFn: () => apiClient.get<Actor[]>('/actors/mine'),
  });
}

export interface ActorStats {
  subscriberCount: number;
  lastBroadcastAt: string | null;
}

export function useActorStats(actorId: string) {
  return useQuery({
    queryKey: ['actor-stats', actorId],
    queryFn: () => apiClient.get<ActorStats>(`/actors/${actorId}/stats`),
    enabled: !!actorId,
  });
}

export interface FanReply extends ChatMessage {
  fanUser: { id: string; displayName: string } | null;
}

export function useActorReplies(actorId: string) {
  return useQuery({
    queryKey: ['actor-replies', actorId],
    queryFn: () => apiClient.get<FanReply[]>(`/actors/${actorId}/messages/replies`),
    enabled: !!actorId,
  });
}

interface SendBroadcastInput {
  mediaType: 'TEXT' | 'PHOTO' | 'AUDIO';
  body?: string;
  mediaUrl?: string;
}

export function useSendBroadcast(actorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendBroadcastInput) =>
      apiClient.post<ChatMessage>(`/actors/${actorId}/messages/broadcast`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actor-stats', actorId] });
    },
  });
}
