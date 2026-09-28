import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export type ParentalConsentStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED';

export interface OnboardingStatus {
  needsTerms: boolean;
  needsBirthDate: boolean;
  needsNickname: boolean;
  parentalConsentStatus: ParentalConsentStatus;
}

export function useOnboardingStatus() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => apiClient.get<OnboardingStatus>('/me/onboarding-status'),
    enabled: !!token,
  });
}

// 약관 버전 — 서버 CURRENT_TERMS_VERSION(backend/src/common/legal/terms.ts)과 같게. 약관 화면 내용을 바꾸면 둘 다 올릴 것
export const TERMS_VERSION = '2026-09-28';

export function useAcceptTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<OnboardingStatus>('/me/terms-agreement', { version: TERMS_VERSION, agreeTerms: true, agreePrivacy: true }),
    onSuccess: (status) => queryClient.setQueryData(['onboarding-status'], status),
  });
}

export function useSetBirthDate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (birthDate: string) =>
      apiClient.patch<{ parentalConsentStatus: ParentalConsentStatus }>('/me/birth-date', { birthDate }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['onboarding-status'] }),
  });
}

export function useRequestParentalConsent() {
  return useMutation({
    mutationFn: (parentEmail: string) => apiClient.post('/me/parental-consent', { parentEmail }),
  });
}

export interface Me {
  id: string;
  role: string;
  locale: string | null;
  nickname: string | null;
  /** 다음에 닉네임을 바꿀 수 있는 시각(없으면 지금 바로 가능) */
  nicknameChangeAvailableAt: string | null;
}

export function useMe() {
  const { token } = useAuth();
  return useQuery({ queryKey: ['me'], queryFn: () => apiClient.get<Me>('/auth/me'), enabled: !!token });
}

// 닉네임 정하기/바꾸기 — 규칙(20자, 예약어, 7일에 한 번)은 서버가 검사하고 이유를 메시지로 돌려줌
export function useUpdateNickname() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nickname: string) => apiClient.patch<Me>('/auth/me/nickname', { nickname }),
    onSuccess: (me) => {
      queryClient.setQueryData(['me'], me);
      void queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      // 채팅방의 {{name}} 자리도 새 닉네임으로
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

// 회원 탈퇴 — 성공하면 호출한 쪽에서 로그아웃
export function useDeleteAccount() {
  return useMutation({ mutationFn: () => apiClient.delete('/auth/me') });
}
