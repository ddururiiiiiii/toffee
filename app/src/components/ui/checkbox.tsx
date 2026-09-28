import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 체크박스 줄 — 선택되면 라벤더 채움 + 흰 체크 */
export function Checkbox({ checked, label, onToggle, bold }: { checked: boolean; label: string; onToggle: () => void; bold?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={styles.row} hitSlop={4}>
      <View style={[styles.box, { borderColor: checked ? theme.tint : theme.textTertiary, backgroundColor: checked ? theme.tint : 'transparent' }]}>
        {checked ? <Check size={15} color="#ffffff" strokeWidth={3} /> : null}
      </View>
      <ThemedText type={bold ? 'defaultSemiBold' : 'default'} style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 4 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1 },
});
