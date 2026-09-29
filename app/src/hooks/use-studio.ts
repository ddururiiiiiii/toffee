import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';
import { useLiveInterval } from '@/lib/realtime';
import { UploadCancelledError, uploadMedia, type UploadMediaType, type UploadOptions } from '@/lib/upload-media';
import { createVideoThumbnail } from '@/lib/video-thumbnail';
import type { FanReply } from './use-console';
import type { ChatMessage } from './use-messages';

// 배우 본인 화면("스튜디오") — 내가 보낸 메시지(+메시지별 팬 답장 수), 발송

/** 스타 화면 "팬 답장 줄" 한 줄 — 서버가 최근 메시지 몇 개에만(답장이 없으면 빈 배열), 오래된 것 → 최신 순으로 줌 */
export interface ReplyPreview {
  id: string;
  nickname: string | null;
  body: string;
  createdAt: string;
}

export interface StudioMessage extends ChatMessage {
  replyCount: number;
  /** 최근 메시지에만 있음 — 없으면 오래된 메시지(답장 줄 없이 숫자만) */
  recentReplies?: ReplyPreview[];
}

export function useStudioMessages(actorId: string) {
  const interval = useLiveInterval(5000);
  return useQuery({
    queryKey: ['actor-broadcasts', actorId],
    // 서버는 최신순으로 줌 — 화면은 inverted 리스트라 그대로 씀
    queryFn: () => apiClient.get<StudioMessage[]>(`/actors/${actorId}/messages/broadcasts`),
    enabled: !!actorId,
    // 팬 답장은 실시간 신호로 바로 반영, 연결이 끊겨 있을 때만 5초 폴링
    refetchInterval: interval,
  });
}

const REPLIES_PAGE_SIZE = 100;

/**
 * 스타 메시지 하나에 달린 팬 답장 — 최신 100개부터, 위로 올리면(fetchNextPage) 이전 100개씩. 서버는 최신 → 오래된 순.
 * 새 답장은 실시간 신호로 바로 채팅처럼 아래에 붙음(연결이 끊겨 있을 때만 3초 폴링).
 */
export function useMessageReplies(actorId: string, messageId: string) {
  const interval = useLiveInterval(3000);
  return useInfiniteQuery({
    queryKey: ['actor-replies', actorId, messageId],
    queryFn: ({ pageParam }) =>
      apiClient.get<FanReply[]>(
        `/actors/${actorId}/messages/replies?messageId=${encodeURIComponent(messageId)}&limit=${REPLIES_PAGE_SIZE}` +
          (pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.length === REPLIES_PAGE_SIZE ? lastPage[lastPage.length - 1].id : undefined),
    enabled: !!actorId && !!messageId,
    refetchInterval: interval,
  });
}

export interface Attachment {
  mediaType: UploadMediaType;
  uri: string;
  contentType?: string;
  /** 음성 녹음일 때 — 카톡식 음파 표시용 */
  durationMs?: number;
  waveform?: number[];
}

// 영상 첫 장면을 사진으로 올림 — 썸네일은 선택이라 만들기·올리기가 실패해도 영상은 그대로 보냄
async function uploadVideoThumbnail(actorId: string, videoUri: string): Promise<string | undefined> {
  const uri = await createVideoThumbnail(videoUri);
  if (!uri) return undefined;
  try {
    return await uploadMedia(actorId, { purpose: 'message', mediaType: 'PHOTO', uri, contentType: 'image/jpeg' });
  } catch {
    return undefined;
  } finally {
    // 웹은 캡처 결과가 blob: 주소라 올린 뒤 메모리 해제
    if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
  }
}

// 미디어가 있으면 먼저 저장소에 올리고(uploadMedia) 받은 키로 발송 — 영상이면 첫 장면 썸네일도 같이.
// onProgress로 올라간 정도(0~1)를, signal로 취소를 받음(큰 영상이 멈춘 것처럼 보이지 않게, 2026-09-28 점검)
export function useStudioSend(actorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      body,
      attachment,
      replyToMessageId,
      onProgress,
      signal,
    }: {
      body: string;
      attachment: Attachment | null;
      /** 인용 답장할 팬 메시지 */
      replyToMessageId?: string;
    } & UploadOptions) => {
      const [mediaKey, thumbnailKey] = await Promise.all([
        attachment
          ? uploadMedia(
              actorId,
              { purpose: 'message', mediaType: attachment.mediaType, uri: attachment.uri, contentType: attachment.contentType },
              { onProgress, signal },
            )
          : undefined,
        attachment?.mediaType === 'VIDEO' ? uploadVideoThumbnail(actorId, attachment.uri) : undefined,
      ]);
      if (signal?.aborted) throw new UploadCancelledError('upload cancelled');
      return apiClient.post<ChatMessage>(`/actors/${actorId}/messages/broadcast`, {
        mediaType: attachment?.mediaType ?? 'TEXT',
        body: body || undefined,
        mediaKey,
        thumbnailKey,
        durationMs: attachment?.durationMs,
        waveform: attachment?.waveform,
        replyToMessageId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['actor-broadcasts', actorId] });
      void queryClient.invalidateQueries({ queryKey: ['actor-stats', actorId] });
    },
  });
}

// 보낸 메시지 삭제(보내기 취소) — 팬 화면에서 사라짐, 소속사 모니터링엔 "삭제한 메시지"로 남음
export function useDeleteBroadcast(actorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => apiClient.delete(`/actors/${actorId}/messages/${messageId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['actor-broadcasts', actorId] }),
  });
}

