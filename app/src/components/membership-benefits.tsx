import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, MessageCircle, Mic, Video, type LucideIcon } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 구독 혜택 아이콘 목록(DESIGN_GUIDE §5·§6) — 스타만 사진·음성·영상을 보내는 비대칭 구조를 그대로 보여줌.
 * "Special updates"는 스토리(3차로 미룸)가 생기기 전까진 약속할 수 없어서 넣지 않음.
 */
export function MembershipBenefits({ name, detailed }: { name: string; detailed?: boolean }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const items: { icon: LucideIcon; title: string; sub: string }[] = [
    { icon: MessageCircle, title: t('actorProfile.benefitDm', { name }), sub: t('actorProfile.benefitDmSub') },
    { icon: ImageIcon, title: t('actorProfile.benefitPhoto'), sub: t('actorProfile.benefitPhotoSub') },
    { icon: Mic, title: t('actorProfile.benefitVoice'), sub: t('actorProfile.benefitVoiceSub') },
    { icon: Video, title: t('actorProfile.benefitVideo'), sub: t('actorProfile.benefitVideoSub', { name }) },
  ];
  return (
    <View style={detailed ? styles.listDetailed : styles.list}>
      {items.map((item) => (
        <View key={item.title} style={styles.row}>
          <View style={[detailed ? styles.iconBoxLarge : styles.iconBox, detailed && { backgroundColor: theme.backgroundElement }]}>
            <Icon as={item.icon} size={detailed ? 20 : 18} color={detailed ? theme.text : theme.tint} />
          </View>
          <View style={styles.text}>
            <ThemedText type={detailed ? 'defaultMedium' : 'small'}>{item.title}</ThemedText>
            {detailed ? (
              <ThemedText type="caption" themeColor="textSecondary">
                {item.sub}
              </ThemedText>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two + 2 },
  listDetailed: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  iconBox: { width: 22, alignItems: 'center' },
  iconBoxLarge: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
});
