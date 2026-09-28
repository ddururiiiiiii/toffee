import { ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { NicknameForm } from '@/components/nickname-form';
import { ThemedText } from '@/components/themed-text';
import { useMe } from '@/hooks/use-onboarding';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/** 닉네임 바꾸기 — 7일에 한 번(가입 후 24시간은 자유). 규칙 위반 사유는 서버 문구 그대로 */
export default function NicknameScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: me } = useMe();
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <NicknameForm initial={me?.nickname} onSaved={() => router.back()} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('nickname.rule')}
      </ThemedText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
