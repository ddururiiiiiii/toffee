import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

/**
 * 버튼 — primary(Charcoal, 핵심 CTA: 구독·보내기 등), accent(Lavender, 절제해서), secondary(Cloud 배경), ghost(글자만),
 * danger(해지·삭제). 가이드: 명확·단순·프리미엄, 지나치게 둥근 알약 모양 피함.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  iconRight,
  loading,
  disabled,
  style,
  children,
}: {
  title?: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'md' | 'lg';
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const palette: Record<Variant, { bg: string; fg: string }> = {
    primary: { bg: theme.primary, fg: theme.onPrimary },
    accent: { bg: theme.tint, fg: '#ffffff' },
    secondary: { bg: theme.backgroundElement, fg: theme.text },
    ghost: { bg: 'transparent', fg: theme.text },
    danger: { bg: theme.backgroundElement, fg: theme.danger },
  };
  const { bg, fg } = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.lg : styles.md,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon && <Icon as={icon} size={size === 'lg' ? 20 : 18} color={fg} />}
          {title ? (
            <ThemedText type={size === 'lg' ? 'defaultSemiBold' : 'smallBold'} style={{ color: fg }} numberOfLines={1}>
              {title}
            </ThemedText>
          ) : null}
          {children}
          {iconRight && <Icon as={iconRight} size={size === 'lg' ? 20 : 18} color={fg} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
  lg: { height: 52, paddingHorizontal: Spacing.four },
  md: { height: 40, paddingHorizontal: Spacing.three, borderRadius: Radius.sm + 2 },
  content: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
