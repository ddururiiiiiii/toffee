import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { bundleDiscountPercent, type Bundle } from '@/hooks/use-bundles';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/constants/theme';
import { formatPrice } from '@/utils/price';

/** 겹친 원형 사진 — 묶음에 든 배우들 */
export function BundleAvatars({ actors, size = 40 }: { actors: Pick<Bundle['actors'][number], 'id' | 'chatDisplayName' | 'chatProfileImageUrl'>[]; size?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.avatars}>
      {actors.map((actor, index) => (
        <Avatar
          key={actor.id}
          uri={actor.chatProfileImageUrl}
          name={actor.chatDisplayName}
          size={size}
          style={[index > 0 && { marginLeft: -size * 0.32 }, { borderWidth: 2, borderColor: theme.background, borderRadius: size / 2 }]}
        />
      ))}
    </View>
  );
}

/**
 * 묶음 한 줄 — 배우 프로필의 "묶음으로 더 저렴하게", 누르면 묶음 구독 확인 화면. 개인 구독 합계 대비 할인율을 같이 보여줌
 * (DESIGN_GUIDE: 가격은 숨기지 않고 분명하게).
 */
export function BundleCard({ bundle, onPress }: { bundle: Bundle; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const discount = bundleDiscountPercent(bundle);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, { borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
      <BundleAvatars actors={bundle.actors} />
      <View style={styles.body}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {bundle.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatPrice(t, bundle.priceCents)} {t('actorProfile.perMonth')}
          {discount > 0 ? ` · ${t('bundle.saveVsSingle', { percent: discount })}` : ''}
        </ThemedText>
      </View>
      <Icon as={ChevronRight} size={18} themeColor="textTertiary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatars: { flexDirection: 'row' },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.lg, borderWidth: 1 },
  body: { flex: 1, gap: 2 },
});
