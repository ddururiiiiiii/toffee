import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useUpdateNickname } from '@/hooks/use-onboarding';
import { ApiError } from '@/lib/api-client';
import { Spacing } from '@/constants/theme';

const MAX_LENGTH = 20;

/** 닉네임 입력 + 저장 — 온보딩과 프로필에서 같이 씀. 규칙 위반 사유는 서버 메시지를 그대로 보여줌 */
export function NicknameForm({ initial, onSaved, submitLabel }: { initial?: string | null; onSaved?: () => void; submitLabel?: string }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial ?? '');
  const update = useUpdateNickname();
  const trimmed = value.trim();

  return (
    <View style={styles.form}>
      <TextField
        value={value}
        onChangeText={setValue}
        placeholder={t('nickname.placeholder', { max: MAX_LENGTH })}
        maxLength={MAX_LENGTH}
        autoCapitalize="none"
        accessibilityLabel={t('nickname.label')}
        error={update.isError ? (update.error instanceof ApiError ? update.error.message : t('nickname.saveFailed')) : null}
        hint={`${trimmed.length}/${MAX_LENGTH}`}
        onSubmitEditing={() => trimmed && update.mutate(trimmed, { onSuccess: () => onSaved?.() })}
      />
      <Button
        title={submitLabel ?? t('nickname.save')}
        loading={update.isPending}
        disabled={!trimmed}
        onPress={() => update.mutate(trimmed, { onSuccess: () => onSaved?.() })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
});
