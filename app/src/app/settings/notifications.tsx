import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BellOff } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { useMySubscriptions, useSetNotificationsMuted, type Subscription } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/** 알림 — 배우별 새 메시지 알림 켜기/끄기(채팅방 🔔과 같은 설정). 끄면 푸시만 빠지고 메시지는 그대로 */
export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { data: subscriptions } = useMySubscriptions();
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.scroll}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        {t('profile.notificationsHint')}
      </ThemedText>
      {subscriptions && subscriptions.length === 0 ? <EmptyState icon={BellOff} title={t('profile.noSubscriptions')} /> : null}
      {subscriptions?.map((sub) => <ActorToggle key={sub.id} sub={sub} />)}
    </ScrollView>
  );
}

function ActorToggle({ sub }: { sub: Subscription }) {
  const theme = useTheme();
  const setMuted = useSetNotificationsMuted(sub.actorId);
  return (
    <View style={styles.row}>
      <Avatar uri={sub.actor.chatProfileImageUrl} name={sub.actor.chatDisplayName} size={40} />
      <ThemedText type="defaultMedium" style={styles.name} numberOfLines={1}>
        {sub.actor.chatDisplayName}
      </ThemedText>
      <Switch
        value={!sub.notificationsMuted}
        onValueChange={(on) => setMuted.mutate(!on)}
        trackColor={{ true: theme.tint, false: theme.border }}
        thumbColor="#ffffff"
        accessibilityLabel={sub.actor.chatDisplayName}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  hint: { paddingHorizontal: Spacing.four, marginBottom: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four, paddingVertical: 10 },
  name: { flex: 1 },
});
