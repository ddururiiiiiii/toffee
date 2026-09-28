import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';

/** 아이콘만 있는 버튼(헤더의 검색·알림·더보기 등) — 누르기 쉬운 44px 영역 */
export function IconButton({
  icon,
  onPress,
  label,
  filled,
  color,
  size = 22,
  style,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  filled?: boolean;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        filled && { backgroundColor: theme.backgroundElement },
        { opacity: pressed ? 0.6 : 1 },
        style,
      ]}>
      <Icon as={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
