import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// 같은 메시지 신고는 서버가 한 줄로 묶고(reportCount), 여러 명이 신고한 것부터 내려줌
export interface PendingReport {
  id: string;
  category: string;
  reason: string | null;
  createdAt: string;
  reportCount: number;
  categories: string[];
  message: {
    id: string;
    actorId: string;
    senderType: 'ARTIST' | 'FAN';
    body: string | null;
    mediaType: string;
    fanUser: { id: string; nickname: string | null; displayName: string } | null;
    actor: { chatDisplayName: string };
  };
  reportedBy: { id: string; displayName: string; nickname: string | null; role: string };
}

export function usePendingReports() {
  return useQuery({
    queryKey: ['admin', 'reports', 'pending'],
    queryFn: () => apiClient.get<PendingReport[]>('/reports/pending'),
  });
}

export function useResolveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/reports/${id}/resolve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'pending'] }),
  });
}

export function useDismissReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/reports/${id}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'pending'] }),
  });
}

export interface BannedWord {
  id: string;
  term: string;
  language: 'ko' | 'th' | 'en';
  createdAt: string;
}

export function useBannedWords() {
  return useQuery({
    queryKey: ['admin', 'banned-words'],
    queryFn: () => apiClient.get<BannedWord[]>('/admin/banned-words'),
  });
}

export function useCreateBannedWord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { term: string; language: 'ko' | 'th' | 'en' }) =>
      apiClient.post<BannedWord>('/admin/banned-words', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'banned-words'] }),
  });
}

export function useDeleteBannedWord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/banned-words/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'banned-words'] }),
  });
}

export type AdminUserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export interface AdminUser {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
  status: AdminUserStatus;
  suspendedUntil: string | null;
  bannedAt: string | null;
  createdAt: string;
}

export function useAdminUsers(query: string) {
  return useQuery({
    queryKey: ['admin', 'users', query],
    queryFn: () => apiClient.get<AdminUser[]>(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  });
}

export function useSuspendUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) =>
      apiClient.patch<AdminUser>(`/admin/users/${id}/suspend`, { until }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useBanUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<AdminUser>(`/admin/users/${id}/ban`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useReactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<AdminUser>(`/admin/users/${id}/reactivate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}
