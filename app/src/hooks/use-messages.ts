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
  /** 스타 메시지를 보낸 배우 — 커플방에서 말풍선마다 누가 보냈는지(1인 방에도 오지만 안 씀) */
  sender?: { id: string; chatDisplayName: string; chatProfileImageUrl: string | null } | null;
  /** 사진·영상 흐린 미리보기(ThumbHash) — 받는 동안 보여줌. 없을 수도 있음(예전 메시지·웹에서 보낸 것) */
  thumbhash?: string | null;
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

/** 채팅방 사진·영상 한 개(모아보기·전체 화면 넘겨보기) */
export interface ChatMediaItem {
  id: string;
  mediaType: 'PHOTO' | 'VIDEO';
  mediaUrl: string | null;
  thumbnailUrl?: string | null;
  thumbhash?: string | null;
  mediaDurationMs?: number | null;
  createdAt: string;
}

const MEDIA_PAGE_SIZE = 60;

/**
 * 팬 채팅방의 스타 사진·영상(최신 → 오래된 순, 60개씩) — "사진·영상 모아보기"와 전체 화면 좌우 넘기기가 같은 목록을 씀
 * (2026-09-29). total은 전체 개수("3 / 12").
 */
export function useChatMedia(actorId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['chat-media', actorId],
    queryFn: ({ pageParam }) =>
      apiClient.get<{ items: ChatMediaItem[]; total: number }>(
        `/actors/${actorId}/messages/media?limit=${MEDIA_PAGE_SIZE}` + (pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.items.length === MEDIA_PAGE_SIZE ? lastPage.items[lastPage.items.length - 1].id : undefined),
    enabled: !!actorId,
  });
}


export type ChatSearchHit = Pick<ChatMessage, 'id' | 'senderType' | 'body' | 'mediaType' | 'createdAt' | 'sender'>;
const SEARCH_PAGE_SIZE = 30;

/**
 * 채팅방 안 검색(2026-09-29) — 글에 검색어가 들어간 메시지(스타 메시지 + 내 답장), 최신 → 오래된 순 30개씩. 2글자 미만이면
 * 안 보냄. 결과는 id만 써서 대화방의 그 위치로 이동함.
 */
export function useChatSearch(actorId: string | undefined, query: string) {
  const q = query.trim();
  return useInfiniteQuery({
    queryKey: ['chat-search', actorId, q],
    queryFn: ({ pageParam }) =>
      apiClient.get<ChatSearchHit[]>(
        `/actors/${actorId}/messages/search?limit=${SEARCH_PAGE_SIZE}&q=${encodeURIComponent(q)}` +
          (pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.length === SEARCH_PAGE_SIZE ? lastPage[lastPage.length - 1].id : undefined),
    enabled: !!actorId && q.length >= 2,
    staleTime: 30_000,
  });
}

/**
 * 메시지 번역(2026-09-29) — "번역 보기"를 누른 메시지만 서버에 요청(서버가 메시지 × 언어마다 한 번 번역해 저장). 결과는 다시 받을 필요가
 * 없어서 앱 켜져 있는 동안 계속 씀.
 */
export function useMessageTranslation(actorId: string, messageId: string, language: string, enabled: boolean) {
  return useQuery({
    queryKey: ['translation', messageId, language],
    queryFn: () => apiClient.post<{ text: string }>(`/actors/${actorId}/messages/${messageId}/translate`, { targetLanguage: language }),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
