import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

// 신고·차단(잠정 정책: 신고는 운영자 대기열로만, 차단은 배우 채널 단위로 답장만 막음 — STATUS.md)

export const REPORT_CATEGORIES = ['SPAM', 'ABUSE', 'SEXUAL', 'PRIVACY', 'OTHER'] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export function useReportMessage() {
  return useMutation({
    mutationFn: (input: { messageId: string; category: ReportCategory; reason?: string }) =>
      apiClient.post('/reports', input),
  });
}

export interface ChannelBlock {
  createdAt: string;
  reason: string | null;
  blockedByRole: string;
  fanUser: { id: string; nickname: string | null; tag: string };
}

export function useChannelBlocks(actorId: string) {
  return useQuery({
    queryKey: ['blocks', actorId],
    queryFn: () => apiClient.get<ChannelBlock[]>(`/actors/${actorId}/blocks`),
    enabled: !!actorId,
  });
}

function useRefreshAfterBlockChange(actorId: string) {
  const queryClient = useQueryClient();
  return (blocks: ChannelBlock[]) => {
    queryClient.setQueryData(['blocks', actorId], blocks);
    // 차단된 팬의 답장이 목록·답장 수·인용에서 빠지므로 관련 화면 새로고침
    void queryClient.invalidateQueries({ queryKey: ['actor-replies', actorId] });
    void queryClient.invalidateQueries({ queryKey: ['actor-broadcasts', actorId] });
  };
}

export function useBlockFan(actorId: string) {
  const refresh = useRefreshAfterBlockChange(actorId);
  return useMutation({
    mutationFn: (fanUserId: string) => apiClient.post<ChannelBlock[]>(`/actors/${actorId}/blocks`, { fanUserId }),
    onSuccess: refresh,
  });
}

export function useUnblockFan(actorId: string) {
  const refresh = useRefreshAfterBlockChange(actorId);
  return useMutation({
    mutationFn: (fanUserId: string) => apiClient.delete<ChannelBlock[]>(`/actors/${actorId}/blocks/${fanUserId}`),
    onSuccess: refresh,
  });
}
