import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 필터 칩(For You / Trending / New) — 선택되면 라벤더 */
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, { backgroundColor: selected ? theme.tint : theme.backgroundElement }]}>
      <ThemedText type="smallBold" style={{ color: selected ? '#ffffff' : theme.textSecondary }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { height: 34, paddingHorizontal: Spacing.three - 2, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
});
