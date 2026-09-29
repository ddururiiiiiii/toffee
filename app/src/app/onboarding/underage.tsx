import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react-native';

import { OnboardingLayout } from '@/components/onboarding-layout';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useDeleteAccount, useOnboardingStatus } from '@/hooks/use-onboarding';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { confirm } from '@/lib/confirm';
import { openSupportMail } from '@/lib/support';
import { SUPPORT_EMAIL } from '@/lib/env';
import { Radius, Spacing } from '@/constants/theme';

/**
 * 성인만 가입(2026-09-29) — 생년월일이 그 나라 성년 나이 미만이면 여기서 멈춤. 생년월일은 한 번만 입력할 수 있어서
 * 잘못 입력했다면 고객센터로(운영자가 확인 후 정정). 개인정보를 남기고 싶지 않으면 바로 탈퇴할 수 있게.
 */
export default function UnderageScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { data: status } = useOnboardingStatus();
  const deleteAccount = useDeleteAccount();
  const [notice, setNotice] = useState<string | null>(null);
  const age = status?.minimumAge ?? 20;

  const startDelete = async () => {
    const ok = await confirm(t('underage.deleteTitle'), t('underage.deleteBody'), t('underage.deleteConfirm'), t('common.cancel'));
    if (!ok) return;
    deleteAccount.mutate(undefined, {
      onSuccess: () => void logout(),
      onError: (e) => setNotice(e instanceof ApiError ? e.message : t('deleteAccount.failed')),
    });
  };

  return (
    <OnboardingLayout
      title={t('underage.title', { age })}
      subtitle={t('underage.body', { age })}
      footer={
        <View style={styles.actions}>
          <Button title={t('underage.deleteTitle')} variant="secondary" onPress={startDelete} loading={deleteAccount.isPending} />
          <Button title={t('underage.logout')} variant="ghost" onPress={() => void logout()} />
        </View>
      }>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <Icon as={ShieldAlert} size={22} color={theme.textSecondary} />
        <View style={styles.cardBody}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('underage.wrongDate')}
          </ThemedText>
          {SUPPORT_EMAIL ? (
            <Button
              title={t('underage.contact')}
              variant="ghost"
              size="md"
              onPress={() => void openSupportMail(undefined).catch(() => setNotice(t('support.openFailed', { email: SUPPORT_EMAIL })))}
              style={styles.contact}
            />
          ) : null}
        </View>
      </View>
      {notice ? (
        <ThemedText type="small" themeColor="danger">
          {notice}
        </ThemedText>
      ) : null}
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  actions: { gap: Spacing.two },
  card: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.four, borderRadius: Radius.lg },
  cardBody: { flex: 1, gap: Spacing.two },
  contact: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
