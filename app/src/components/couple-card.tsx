import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react-native';

import { BundleAvatars } from '@/components/bundle-card';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { membersOf, type Actor } from '@/hooks/use-actors';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/constants/theme';
import { formatPrice } from '@/utils/price';

/** 커플방(CP) 한 줄(아티스트 프로필 "CP", 둘러보기) — 멤버 사진 겹침 + 공식 이름 + 멤버 공식 이름 + 월 가격. 구독 전 화면이라 방 닉네임 대신 공식 이름(2026-10-02) */
export function CoupleCard({ room, onPress }: { room: Actor; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const members = membersOf(room);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, { borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
      <BundleAvatars actors={members} />
      <View style={styles.body}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {room.legalName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {members.map((member) => member.legalName).join(' · ')} · {formatPrice(t, room.monthlyPriceCents)} {t('actorProfile.perMonth')}
        </ThemedText>
      </View>
      <Icon as={ChevronRight} size={18} themeColor="textTertiary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.lg, borderWidth: 1 },
  body: { flex: 1, gap: 2 },
});
