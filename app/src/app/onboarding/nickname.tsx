import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { NicknameForm } from '@/components/nickname-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// 팬 온보딩 마지막 단계 — 저장되면 온보딩 상태가 갱신되고 AuthGate가 알아서 다음 화면으로 보냄
export default function NicknameOnboardingScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          {t('onboarding.nicknameTitle')}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          {t('onboarding.nicknameHint')}
        </ThemedText>
        <NicknameForm />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.four },
  title: { textAlign: 'center', fontSize: 28, lineHeight: 36 },
  subtitle: { textAlign: 'center' },
});
