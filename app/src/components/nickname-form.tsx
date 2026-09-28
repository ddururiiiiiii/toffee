import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useUpdateNickname } from '@/hooks/use-onboarding';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { Spacing } from '@/constants/theme';

const MAX_LENGTH = 20;

/** 닉네임 입력 + 저장 — 온보딩과 마이페이지에서 같이 씀. 규칙 위반 사유는 서버 메시지를 그대로 보여줌 */
export function NicknameForm({ initial, onSaved }: { initial?: string | null; onSaved?: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [value, setValue] = useState(initial ?? '');
  const update = useUpdateNickname();
  const trimmed = value.trim();

  return (
    <ThemedView style={styles.form}>
      <ThemedView style={styles.row}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={t('nickname.placeholder', { max: MAX_LENGTH })}
          placeholderTextColor={theme.textSecondary}
          maxLength={MAX_LENGTH}
          autoCapitalize="none"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        <Pressable
          onPress={() => update.mutate(trimmed, { onSuccess: () => onSaved?.() })}
          disabled={!trimmed || update.isPending}
          style={[styles.button, { backgroundColor: theme.tint, opacity: trimmed ? 1 : 0.5 }]}>
          {update.isPending ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.buttonText}>{t('nickname.save')}</ThemedText>}
        </Pressable>
      </ThemedView>
      {update.isError && (
        <ThemedText type="small" themeColor="danger">
          {update.error instanceof ApiError ? update.error.message : t('nickname.saveFailed')}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.two, backgroundColor: 'transparent' },
  row: { flexDirection: 'row', gap: Spacing.two, backgroundColor: 'transparent' },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  button: { borderRadius: 10, paddingHorizontal: Spacing.four, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
