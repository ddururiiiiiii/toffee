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

export type AssignableRole = 'USER' | 'ACTOR' | 'AGENCY_STAFF';

export interface AdminUser {
  id: string;
  displayName: string;
  nickname: string | null;
  email: string | null;
  role: AssignableRole | 'ADMIN';
  status: AdminUserStatus;
  suspendedUntil: string | null;
  bannedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  agency: { id: string; name: string } | null;
  actorSelf: { id: string; legalName: string } | null;
}

export function useAdminUsers(query: string, role?: AdminUser['role']) {
  return useQuery({
    queryKey: ['admin', 'users', query, role ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (role) params.set('role', role);
      const qs = params.toString();
      return apiClient.get<AdminUser[]>(`/admin/users${qs ? `?${qs}` : ''}`);
    },
  });
}

// 역할이 바뀌면 배우 본인 연결·소속사 배정이 끊길 수 있어서 배우/소속사 목록도 같이 새로고침
function invalidateAdminAccounts(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  void queryClient.invalidateQueries({ queryKey: ['admin', 'actors'] });
  void queryClient.invalidateQueries({ queryKey: ['admin', 'agencies'] });
}

export function useChangeUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: AssignableRole }) => apiClient.patch<AdminUser>(`/admin/users/${id}/role`, { role }),
    onSuccess: () => invalidateAdminAccounts(queryClient),
  });
}

export function useAssignStaffAgency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, agencyId }: { id: string; agencyId: string | null }) =>
      apiClient.patch(`/admin/users/${id}/agency`, { agencyId }),
    onSuccess: () => invalidateAdminAccounts(queryClient),
  });
}

// ── 소속사 ──────────────────────────────────────────────

export interface AdminAgency {
  id: string;
  name: string;
  logoUrl: string | null;
  createdAt: string;
  actorCount: number;
  staffCount: number;
}

export function useAdminAgencies() {
  return useQuery({
    queryKey: ['admin', 'agencies'],
    queryFn: () => apiClient.get<AdminAgency[]>('/admin/agencies'),
  });
}

export function useCreateAgency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiClient.post<AdminAgency>('/admin/agencies', { name }),
    onSuccess: () => invalidateAdminAccounts(queryClient),
  });
}

export function useUpdateAgency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; logoUrl?: string | null }) =>
      apiClient.patch<AdminAgency>(`/admin/agencies/${id}`, input),
    onSuccess: () => {
      invalidateAdminAccounts(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['agencies'] });
      void queryClient.invalidateQueries({ queryKey: ['actors'] });
    },
  });
}

// ── 배우 ──────────────────────────────────────────────

export interface AdminActor {
  id: string;
  legalName: string;
  officialProfileImageUrl: string | null;
  chatDisplayName: string;
  chatProfileImageUrl: string | null;
  monthlyPriceCents: number;
  verified: boolean;
  createdAt: string;
  agency: { id: string; name: string; logoUrl: string | null } | null;
  selfUser: { id: string; displayName: string; email: string | null } | null;
  activeSubscriberCount: number;
}

export interface AgencyHistoryEntry {
  id: string;
  startedAt: string;
  endedAt: string | null;
  agency: { id: string; name: string };
}

export function useAdminActors(query: string) {
  return useQuery({
    queryKey: ['admin', 'actors', 'list', query],
    queryFn: () => apiClient.get<AdminActor[]>(`/admin/actors${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  });
}

export function useAdminActor(id: string) {
  return useQuery({
    queryKey: ['admin', 'actors', id],
    queryFn: () => apiClient.get<AdminActor>(`/admin/actors/${id}`),
  });
}

export function useActorAgencyHistory(id: string) {
  return useQuery({
    queryKey: ['admin', 'actors', id, 'history'],
    queryFn: () => apiClient.get<AgencyHistoryEntry[]>(`/admin/actors/${id}/agency-history`),
  });
}

// 배우 정보가 바뀌면 팬 쪽 목록(['actors'])·운영자 목록 둘 다 새로고침
function useActorMutation<TInput>(request: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'actors'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'agencies'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void queryClient.invalidateQueries({ queryKey: ['actors'] });
    },
  });
}

export function useCreateActor() {
  return useActorMutation((input: { legalName: string; chatDisplayName: string; monthlyPriceCents: number; agencyId?: string }) =>
    apiClient.post<AdminActor>('/admin/actors', input),
  );
}

export function useUpdateActor(id: string) {
  return useActorMutation(
    (input: { legalName?: string; chatDisplayName?: string; monthlyPriceCents?: number; verified?: boolean }) =>
      apiClient.patch<AdminActor>(`/admin/actors/${id}`, input),
  );
}

export function useUpdateActorImages(id: string) {
  return useActorMutation((input: { officialProfileImageKey?: string | null; chatProfileImageKey?: string | null }) =>
    apiClient.patch<AdminActor>(`/admin/actors/${id}/images`, input),
  );
}

export function useAssignActorAgency(id: string) {
  return useActorMutation((agencyId: string | null) => apiClient.patch(`/admin/actors/${id}/agency`, { agencyId }));
}

export function useLinkActorUser(id: string) {
  return useActorMutation((userId: string | null) => apiClient.patch<AdminActor>(`/admin/actors/${id}/self-user`, { userId }));
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

// ── 통계(2026-09-28) — 앱 홈은 summary 숫자, 통계 화면은 일별 추이·분포 ──────────────

export interface AdminStatsSummary {
  timeZone: string;
  fans: { total: number; newToday: number; new7d: number; activeToday: number; active30d: number };
  subscriptions: {
    active: number;
    subscribedFans: number;
    subscriptionRate: number;
    startedToday: number;
    cancelledToday: number;
    started30d: number;
    cancelled30d: number;
  };
  reports: { pending: number };
  messages: { starToday: number; fanRepliesToday: number };
}

export interface AdminStatsDay {
  day: string;
  signups: number;
  subscriptionsStarted: number;
  subscriptionsCancelled: number;
  newRevenueCents: number;
  starMessages: number;
  fanReplies: number;
}

export interface AdminStatsBreakdown {
  countries: { key: string; count: number }[];
  platforms: { key: string; count: number }[];
  locales: { key: string; count: number }[];
  providers: { key: string; count: number }[];
  actors: {
    id: string;
    name: string;
    nickname: string;
    activeSubscribers: number;
    started30d: number;
    cancelled30d: number;
    newRevenue30dCents: number;
  }[];
}

export function useAdminStatsSummary() {
  return useQuery({
    queryKey: ['admin', 'stats', 'summary'],
    queryFn: () => apiClient.get<AdminStatsSummary>('/admin/stats/summary'),
    refetchInterval: 60_000,
  });
}

export function useAdminStatsDaily(days: number) {
  return useQuery({
    queryKey: ['admin', 'stats', 'daily', days],
    queryFn: () => apiClient.get<AdminStatsDay[]>(`/admin/stats/daily?days=${days}`),
  });
}

export function useAdminStatsBreakdown() {
  return useQuery({
    queryKey: ['admin', 'stats', 'breakdown'],
    queryFn: () => apiClient.get<AdminStatsBreakdown>('/admin/stats/breakdown'),
  });
}

