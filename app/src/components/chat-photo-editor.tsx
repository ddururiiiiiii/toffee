import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiClient } from '@/lib/api-client';
import { confirm } from '@/lib/confirm';
import { uploadChatProfileImage } from '@/lib/upload-media';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

/**
 * 대화방 사진 바꾸기(스튜디오·콘솔) — 공식 사진·이름은 운영자가 관리하고, 채팅방에 보이는 사진은 배우 쪽이
 * 메신저 프로필처럼 자유롭게 바꿈(2026-09-28 사용자 결정).
 */
export function ChatPhotoEditor({ actorId, hasPhoto }: { actorId: string; hasPhoto: boolean }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState(false);
  const save = useMutation({
    mutationFn: (key: string | null) => apiClient.patch(`/actors/${actorId}/chat-profile-image`, { key }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['actors'] });
      void queryClient.invalidateQueries({ queryKey: ['my-actors'] });
    },
  });
  const [uploading, setUploading] = useState(false);
  const busy = uploading || save.isPending;

  const change = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setError(false);
    setUploading(true);
    try {
      await save.mutateAsync(await uploadChatProfileImage(actorId, asset.uri, asset.mimeType));
    } catch {
      setError(true);
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (await confirm(t('chatPhoto.removeTitle'), t('chatPhoto.removeConfirm'), t('chatPhoto.remove'), t('common.cancel'))) {
      setError(false);
      save.mutate(null, { onError: () => setError(true) });
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.row}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={change}
          style={[styles.chip, { borderColor: theme.backgroundSelected }, busy && styles.disabled]}>
          <ThemedText type="small">{busy ? t('chatPhoto.uploading') : t('chatPhoto.change')}</ThemedText>
        </Pressable>
        {hasPhoto && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={remove}
            style={[styles.chip, { borderColor: theme.backgroundSelected }, busy && styles.disabled]}>
            <ThemedText type="small" themeColor="danger">
              {t('chatPhoto.remove')}
            </ThemedText>
          </Pressable>
        )}
      </ThemedView>
      {error && (
        <ThemedText type="small" themeColor="danger">
          {t('chatPhoto.failed')}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4, backgroundColor: 'transparent' },
  row: { flexDirection: 'row', gap: Spacing.two, backgroundColor: 'transparent' },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: 4 },
  disabled: { opacity: 0.5 },
});
