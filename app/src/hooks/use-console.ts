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
  mediaType: 'TEXT' | 'PHOTO' | 'AUDIO' | 'VIDEO';
  body?: string;
  mediaUrl?: string;
}

// 배우 본인 전용 — 소속사 콘솔에서는 안 씀(발송 권한 없음). 배우용 화면 만들 때 재사용
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

// 소속사 모니터링 — 배우가 실제로 보낸 메시지를 읽기 전용으로 확인
export function useActorBroadcasts(actorId: string) {
  return useQuery({
    queryKey: ['actor-broadcasts', actorId],
    queryFn: () => apiClient.get<ChatMessage[]>(`/actors/${actorId}/messages/broadcasts`),
    enabled: !!actorId,
    refetchInterval: 10000,
  });
}

export interface ActorStory {
  id: string;
  actorId: string;
  mediaType: 'PHOTO' | 'AUDIO' | 'VIDEO';
  mediaUrl: string;
  createdAt: string;
  expiresAt: string;
}

// 소속사 모니터링 — 배우가 올린 스토리(만료 안 된 것) 읽기 전용 조회
export function useActorStories(actorId: string) {
  return useQuery({
    queryKey: ['actor-stories', actorId],
    queryFn: () => apiClient.get<ActorStory[]>(`/actors/${actorId}/stories`),
    enabled: !!actorId,
    refetchInterval: 10000,
  });
}
