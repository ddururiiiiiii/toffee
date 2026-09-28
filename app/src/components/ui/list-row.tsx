import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 설정 목록 한 줄(Profile 화면 등) — 왼쪽 아이콘, 제목·설명, 오른쪽 값·화살표 */
export function ListRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
  danger,
  trailing,
  showChevron = true,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  trailing?: ReactNode;
  showChevron?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      {icon && (
        <View style={[styles.iconBox, { backgroundColor: theme.backgroundElement }]}>
          <Icon as={icon} size={19} color={danger ? theme.danger : theme.text} />
        </View>
      )}
      <View style={styles.body}>
        <ThemedText type="defaultMedium" style={danger ? { color: theme.danger } : undefined}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {value ? (
        <ThemedText type="small" themeColor="textSecondary">
          {value}
        </ThemedText>
      ) : null}
      {trailing}
      {onPress && showChevron && !danger ? <Icon as={ChevronRight} size={18} themeColor="textTertiary" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four, paddingVertical: 14 },
  iconBox: { width: 36, height: 36, borderRadius: Radius.sm + 2, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 1 },
});
