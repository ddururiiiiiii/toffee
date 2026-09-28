import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/** 안 읽은 개수 — 라벤더 원(가이드: 배지를 과하게 쓰지 말 것 → 숫자만, 99+까지) */
export function CountBadge({ count }: { count: number }) {
  const theme = useTheme();
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: theme.tint }]}>
      <ThemedText type="captionBold" style={styles.text}>
        {count > 99 ? '99+' : count}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#ffffff', lineHeight: 14, fontSize: 11 },
});
