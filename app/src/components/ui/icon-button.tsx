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
  disabled,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  filled?: boolean;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityState={disabled ? { disabled: true } : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        filled && { backgroundColor: theme.backgroundElement },
        { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 },
        style,
      ]}>
      <Icon as={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
