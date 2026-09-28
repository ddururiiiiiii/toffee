import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ChatPhotoEditor } from '@/components/chat-photo-editor';
import { SupportLink } from '@/components/support-link';
import { useActor, type Actor } from '@/hooks/use-actors';
import { useTheme } from '@/hooks/use-theme';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Spacing } from '@/constants/theme';

/**
 * 배우 본인의 "내 프로필" — 채팅방에 보이는 닉네임·사진은 배우가 직접, 공식 사진·공식 이름은 운영자가 관리
 * (2026-09-28 사용자 결정). 채널이 하나뿐인 배우는 스튜디오 목록을 건너뛰고 바로 채팅방으로 가기 때문에
 * 로그아웃도 여기에 둠.
 */
function NicknameForm({ actor }: { actor: Actor }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [nickname, setNickname] = useState(actor.chatDisplayName);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const save = useMutation({
    mutationFn: (value: string) => apiClient.patch<Actor>(`/actors/${actor.id}/nickname`, { nickname: value }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['actors'] });
      void queryClient.invalidateQueries({ queryKey: ['my-actors'] });
      setMessage({ text: t('studioProfile.saved'), error: false });
    },
    onError: (e) => setMessage({ text: e instanceof ApiError ? e.message : t('studioProfile.saveFailed'), error: true }),
  });
  const unchanged = nickname.trim() === actor.chatDisplayName;

  return (
    <ThemedView style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{t('studioProfile.nickname')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('studioProfile.nicknameHint')}
      </ThemedText>
      <TextInput
        value={nickname}
        onChangeText={(value) => (setNickname(value), setMessage(null))}
        maxLength={20}
        style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
      />
      {message && (
        <ThemedText type="small" themeColor={message.error ? 'danger' : 'textSecondary'}>
          {message.text}
        </ThemedText>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={unchanged || !nickname.trim() || save.isPending}
        onPress={() => save.mutate(nickname.trim())}
        style={[styles.button, { backgroundColor: theme.tint }, (unchanged || !nickname.trim() || save.isPending) && styles.disabled]}>
        <ThemedText type="smallBold" style={styles.buttonText}>
          {t('studioProfile.save')}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

export default function StudioProfileScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { actorId } = useLocalSearchParams<{ actorId: string }>();
  const { data: actor } = useActor(actorId);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {actor && (
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedView style={[styles.section, styles.photoSection, { backgroundColor: theme.backgroundElement }]}>
            <Image
              source={{ uri: actor.chatProfileImageUrl ?? undefined }}
              style={[styles.photo, { backgroundColor: theme.backgroundSelected }]}
            />
            <ChatPhotoEditor actorId={actor.id} hasPhoto={!!actor.chatProfileImageUrl} />
          </ThemedView>
          <NicknameForm key={actor.id} actor={actor} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('studioProfile.officialNote', { name: actor.legalName })}
          </ThemedText>
          <SupportLink />
          <Pressable onPress={logout} style={[styles.logout, { borderColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold" themeColor="danger">
              {t('common.logout')}
            </ThemedText>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  section: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  photoSection: { alignItems: 'center' },
  photo: { width: 96, height: 96, borderRadius: 48 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  button: { borderRadius: 10, paddingVertical: Spacing.two + 2, alignItems: 'center' },
  buttonText: { color: '#fff' },
  disabled: { opacity: 0.5 },
  logout: { borderWidth: 1, borderRadius: 10, paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.two },
});
