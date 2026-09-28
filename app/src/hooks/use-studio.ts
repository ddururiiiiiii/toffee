import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';
import { uploadMedia, type UploadMediaType } from '@/lib/upload-media';
import type { FanReply } from './use-console';
import type { ChatMessage } from './use-messages';

// 배우 본인 화면("스튜디오") — 내가 보낸 메시지(+메시지별 팬 답장 수), 발송, 스토리 올리기

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
}

// 미디어가 있으면 먼저 저장소에 올리고(uploadMedia) 받은 키로 발송
export function useStudioSend(actorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, attachment }: { body: string; attachment: Attachment | null }) => {
      const mediaKey = attachment
        ? await uploadMedia(actorId, { purpose: 'message', ...attachment })
        : undefined;
      return apiClient.post<ChatMessage>(`/actors/${actorId}/messages/broadcast`, {
        mediaType: attachment?.mediaType ?? 'TEXT',
        body: body || undefined,
        mediaKey,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['actor-broadcasts', actorId] });
      void queryClient.invalidateQueries({ queryKey: ['actor-stats', actorId] });
    },
  });
}

export function useCreateStory(actorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (attachment: Attachment) => {
      const mediaKey = await uploadMedia(actorId, { purpose: 'story', ...attachment });
      return apiClient.post(`/actors/${actorId}/stories`, { mediaType: attachment.mediaType, mediaKey });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['actor-stories', actorId] });
    },
  });
}
