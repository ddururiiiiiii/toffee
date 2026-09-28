import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';

export interface MessageQuote {
  id: string;
  hidden: boolean;
  nickname: string | null;
  body: string | null;
}

export interface ChatMessage {
  id: string;
  actorId: string;
  senderType: 'ARTIST' | 'FAN';
  fanUserId: string | null;
  mediaType: 'TEXT' | 'PHOTO' | 'AUDIO' | 'VIDEO';
  body: string | null;
  mediaUrl: string | null;
  // 음성 메시지일 때만(없을 수도 있음)
  mediaDurationMs?: number | null;
  waveform?: number[] | null;
  // 스타의 인용 답장이면 인용한 팬 메시지 요약(전체 공개, 닉네임만)
  replyTo?: MessageQuote | null;
  // 스타·소속사 화면용(팬 화면엔 지워진 메시지가 아예 안 옴) — 스타가 삭제했거나 운영자가 신고 승인으로 가림
  deletedAt?: string | null;
  deletedByAdmin?: boolean;
  createdAt: string;
}

export function useActorMessages(actorId: string) {
  return useQuery({
    queryKey: ['messages', actorId],
    queryFn: () => apiClient.get<ChatMessage[]>(`/actors/${actorId}/messages`),
    enabled: !!actorId,
    // 실시간 소켓은 나중에(10단계, 계약 성사 후) — 지금은 짧은 폴링으로 충분. 권한 없음(403, 구독 끝남)은
    // 재시도·폴링해도 안 바뀌어서 바로 멈춤
    refetchInterval: (query) => (query.state.error instanceof ApiError && query.state.error.status === 403 ? false : 5000),
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 3,
  });
}

export function useSendReply(actorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => apiClient.post<ChatMessage>(`/actors/${actorId}/messages/reply`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', actorId] });
      queryClient.invalidateQueries({ queryKey: ['reply-quota', actorId] });
    },
  });
}

// 스타 메시지 하나당 보낼 수 있는 답장 수(서버 설정, 기본 3) — 입력창 위 "남은 답장 N개"
export interface ReplyQuota {
  messageId: string | null;
  limit: number;
  used: number;
  remaining: number;
}

export function useReplyQuota(actorId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['reply-quota', actorId],
    queryFn: () => apiClient.get<ReplyQuota>(`/actors/${actorId}/messages/reply-quota`),
    enabled: !!actorId && enabled,
    refetchInterval: 5000,
  });
}

