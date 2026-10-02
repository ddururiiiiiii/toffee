import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { membersOf, useActor } from '@/hooks/use-actors';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/**
 * 대화방 프로필 카드(2026-10-02, 카톡 프로필처럼) — 채팅방 헤더 이름이나 메시지 옆 프로필 사진을 누르면 열림.
 * 정보만 보여줌: 대화방 사진(누르면 크게), 닉네임(크게) + 공식 이름(작게, 다를 때만), 커플방이면 멤버.
 * 신고·인증 배지·모아보기·구독 관리는 넣지 않음(신고는 메시지 길게 누르기, 나머지는 채팅방 ⋯ 메뉴).
 * memberId가 있으면 커플방 멤버 배우 한 명의 카드(커플방에서 메시지 옆 사진을 눌렀을 때).
 * 구독 전 둘러보기는 공식 프로필(actor/[id], 공식 이름·공식 사진만)이고, 이 카드는 구독자만 들어오는 채팅방에서만 열림.
 */
export default function ChatProfileScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { actorId, memberId } = useLocalSearchParams<{ actorId: string; memberId?: string }>();
  const { data: actor } = useActor(actorId);
  const close = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/chat/[actorId]', params: { actorId } }));

  const members = actor ? membersOf(actor) : [];
  const member = memberId ? members.find((m) => m.id === memberId) : undefined;
  const profile = member
    ? { name: member.chatDisplayName, official: member.legalName, photo: member.chatProfileImageUrl ?? actor?.chatProfileImageUrl ?? null }
    : actor
      ? { name: actor.chatDisplayName, official: actor.legalName, photo: actor.chatProfileImageUrl }
      : null;

  const openPhoto = () => {
    if (!profile?.photo) return;
    router.push({ pathname: '/media-viewer', params: { id: `profile-${memberId ?? actorId}`, url: profile.photo, type: 'PHOTO' } });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <IconButton icon={X} label={t('chatProfile.close')} onPress={close} />
      </View>
      {profile ? (
        <ScrollView contentContainerStyle={styles.body}>
          <Pressable onPress={openPhoto} disabled={!profile.photo} accessibilityRole="imagebutton" accessibilityLabel={t('chatProfile.viewPhoto')}>
            <Avatar uri={profile.photo} name={profile.name} size={128} />
          </Pressable>
          <View style={styles.names}>
            <ThemedText type="title" style={styles.center}>
              {profile.name}
            </ThemedText>
            {profile.official !== profile.name ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                {profile.official}
              </ThemedText>
            ) : null}
          </View>

          {!member && members.length > 0 ? (
            // 커플방 카드: 멤버 배우 — 누르면 그 배우 카드
            <View style={[styles.members, { borderTopColor: theme.border }]}>
              <ThemedText type="captionBold" themeColor="textTertiary">
                {t('chatProfile.members')}
              </ThemedText>
              {members.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => router.push({ pathname: '/chat-profile/[actorId]', params: { actorId, memberId: m.id } })}
                  style={styles.member}
                  accessibilityRole="button">
                  <Avatar uri={m.chatProfileImageUrl ?? actor?.chatProfileImageUrl} name={m.chatDisplayName} size={44} />
                  <View style={styles.memberNames}>
                    <ThemedText type="defaultSemiBold" numberOfLines={1}>
                      {m.chatDisplayName}
                    </ThemedText>
                    {m.legalName !== m.chatDisplayName ? (
                      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                        {m.legalName}
                      </ThemedText>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Spacing.two, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  body: { alignItems: 'center', paddingHorizontal: Spacing.four, paddingTop: Spacing.five, paddingBottom: Spacing.six, gap: Spacing.four, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  names: { alignItems: 'center', gap: Spacing.one },
  center: { textAlign: 'center' },
  members: { alignSelf: 'stretch', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three, gap: Spacing.two },
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.one },
  memberNames: { flex: 1, minWidth: 0 },
});
