import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { useLiveInterval } from '@/lib/realtime';

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
  // 영상 첫 장면 사진(없을 수도 있음 — 예전 메시지, 캡처 실패)
  thumbnailUrl?: string | null;
  // 스타의 인용 답장이면 인용한 팬 메시지 요약(전체 공개, 닉네임만)
  replyTo?: MessageQuote | null;
  // 스타·소속사 화면용(팬 화면엔 지워진 메시지가 아예 안 옴) — 스타가 삭제했거나 운영자가 신고 승인으로 가림
  deletedAt?: string | null;
  deletedByAdmin?: boolean;
  createdAt: string;
}

const MESSAGES_PAGE_SIZE = 50;

/**
 * 팬 채팅방 — 최신 50개부터, 위로 올리면(fetchNextPage) 이전 50개씩. 서버는 최신 → 오래된 순으로 줌(뒤집힌 목록에 그대로).
 * 예전엔 대화 전체를 5초마다 통째로 받아서 오래 구독할수록 느려졌음(2026-09-28 점검).
 * 새 메시지는 실시간 신호(lib/realtime)로 바로 반영, 연결이 끊겨 있을 때만 5초 폴링. 권한 없음(403, 구독 끝남)은
 * 재시도·폴링해도 안 바뀌어서 바로 멈춤.
 */
export function useActorMessages(actorId: string) {
  const interval = useLiveInterval(5000);
  return useInfiniteQuery({
    queryKey: ['messages', actorId],
    queryFn: ({ pageParam }) =>
      apiClient.get<ChatMessage[]>(
        `/actors/${actorId}/messages?limit=${MESSAGES_PAGE_SIZE}` + (pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.length === MESSAGES_PAGE_SIZE ? lastPage[lastPage.length - 1].id : undefined),
    enabled: !!actorId,
    refetchInterval: (query) => (query.state.error instanceof ApiError && query.state.error.status === 403 ? false : interval),
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
  const interval = useLiveInterval(5000);
  return useQuery({
    queryKey: ['reply-quota', actorId],
    queryFn: () => apiClient.get<ReplyQuota>(`/actors/${actorId}/messages/reply-quota`),
    enabled: !!actorId && enabled,
    refetchInterval: interval,
  });
}

