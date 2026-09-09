import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface ChatMessage {
  id: string;
  actorId: string;
  senderType: 'ARTIST' | 'FAN';
  fanUserId: string | null;
  mediaType: 'TEXT' | 'PHOTO' | 'AUDIO';
  body: string | null;
  mediaUrl: string | null;
  createdAt: string;
}

export function useActorMessages(actorId: string) {
  return useQuery({
    queryKey: ['messages', actorId],
    queryFn: () => apiClient.get<ChatMessage[]>(`/actors/${actorId}/messages`),
    enabled: !!actorId,
    // 실시간 소켓은 나중에(10단계, 계약 성사 후) — 지금은 짧은 폴링으로 충분
    refetchInterval: 5000,
  });
}

export function useSendReply(actorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => apiClient.post<ChatMessage>(`/actors/${actorId}/messages/reply`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', actorId] });
    },
  });
}
