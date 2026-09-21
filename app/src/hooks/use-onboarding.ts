import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export type ParentalConsentStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED';

export interface OnboardingStatus {
  needsBirthDate: boolean;
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
