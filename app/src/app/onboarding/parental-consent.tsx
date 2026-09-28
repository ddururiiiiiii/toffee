import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MailCheck } from 'lucide-react-native';

import { OnboardingLayout } from '@/components/onboarding-layout';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useRequestParentalConsent } from '@/hooks/use-onboarding';
import { ApiError } from '@/lib/api-client';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/constants/theme';

// 미성년자 — 부모님 이메일로 동의 요청(부모가 메일의 페이지에서 "동의합니다"를 누르면 자동으로 이용 가능)
export default function ParentalConsentOnboardingScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [parentEmail, setParentEmail] = useState('');
  const requestConsent = useRequestParentalConsent();
  const valid = parentEmail.includes('@');

  return (
    <OnboardingLayout
      title={t('onboarding.consentTitle')}
      subtitle={t('onboarding.consentHint')}
      footer={
        requestConsent.isSuccess ? (
          <Button
            title={t('onboarding.consentResend')}
            variant="secondary"
            loading={requestConsent.isPending}
            onPress={() => requestConsent.mutate(parentEmail)}
          />
        ) : (
          <Button
            title={t('onboarding.consentSend')}
            loading={requestConsent.isPending}
            disabled={!valid}
            onPress={() => requestConsent.mutate(parentEmail)}
          />
        )
      }>
      {requestConsent.isSuccess ? (
        <View style={[styles.sent, { backgroundColor: theme.tintSoft }]}>
          <Icon as={MailCheck} size={24} color={theme.tint} />
          <View style={styles.sentBody}>
            <ThemedText type="headline">{t('onboarding.consentSentTitle')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('onboarding.consentSentHint')}
            </ThemedText>
          </View>
        </View>
      ) : (
        <TextField
          value={parentEmail}
          onChangeText={setParentEmail}
          placeholder={t('onboarding.parentEmailPlaceholder')}
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel={t('onboarding.parentEmailPlaceholder')}
          error={requestConsent.isError ? (requestConsent.error instanceof ApiError ? requestConsent.error.message : t('onboarding.consentSendFailed')) : null}
        />
      )}
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  sent: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.four, borderRadius: Radius.lg },
  sentBody: { flex: 1, gap: 4 },
});
