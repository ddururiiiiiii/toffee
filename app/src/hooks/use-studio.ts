import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';
import { uploadMedia, type UploadMediaType } from '@/lib/upload-media';
import { createVideoThumbnail } from '@/lib/video-thumbnail';
import type { FanReply } from './use-console';
import type { ChatMessage } from './use-messages';

// 배우 본인 화면("스튜디오") — 내가 보낸 메시지(+메시지별 팬 답장 수), 발송

export interface StudioMessage extends ChatMessage {
  replyCount: number;
}

export function useStudioMessages(actorId: string) {
  return useQuery({
    queryKey: ['actor-broadcasts', actorId],
    // 서버는 최신순으로 줌 — 화면은 inverted 리스트라 그대로 씀
    queryFn: () => apiClient.get<StudioMessage[]>(`/actors/${actorId}/messages/broadcasts`),
    enabled: !!actorId,
    refetchInterval: 10000,
  });
}

export function useMessageReplies(actorId: string, messageId: string) {
  return useQuery({
    queryKey: ['actor-replies', actorId, messageId],
    queryFn: () =>
      apiClient.get<FanReply[]>(`/actors/${actorId}/messages/replies?messageId=${encodeURIComponent(messageId)}`),
    enabled: !!actorId && !!messageId,
    refetchInterval: 10000,
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

// 미디어가 있으면 먼저 저장소에 올리고(uploadMedia) 받은 키로 발송 — 영상이면 첫 장면 썸네일도 같이
export function useStudioSend(actorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      body,
      attachment,
      replyToMessageId,
    }: {
      body: string;
      attachment: Attachment | null;
      /** 인용 답장할 팬 메시지 */
      replyToMessageId?: string;
    }) => {
      const [mediaKey, thumbnailKey] = await Promise.all([
        attachment
          ? uploadMedia(actorId, {
              purpose: 'message',
              mediaType: attachment.mediaType,
              uri: attachment.uri,
              contentType: attachment.contentType,
            })
          : undefined,
        attachment?.mediaType === 'VIDEO' ? uploadVideoThumbnail(actorId, attachment.uri) : undefined,
      ]);
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

