import { useTranslation } from 'react-i18next';

import { NicknameForm } from '@/components/nickname-form';
import { OnboardingLayout } from '@/components/onboarding-layout';

// 팬 온보딩 마지막 단계 — 저장되면 온보딩 상태가 갱신되고 AuthGate가 알아서 다음 화면으로 보냄
export default function NicknameOnboardingScreen() {
  const { t } = useTranslation();
  return (
    <OnboardingLayout step={3} title={t('onboarding.nicknameTitle')} subtitle={t('onboarding.nicknameHint')}>
      <NicknameForm submitLabel={t('onboarding.next')} />
    </OnboardingLayout>
  );
}
