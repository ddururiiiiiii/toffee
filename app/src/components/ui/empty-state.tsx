import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 빈 화면·오류 안내 — 아이콘 + 제목 + 설명 + (버튼) */
export function EmptyState({ icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.box}>
      <View style={[styles.iconCircle, { backgroundColor: theme.backgroundElement }]}>
        <Icon as={icon} size={26} themeColor="textSecondary" />
      </View>
      <ThemedText type="headline" style={styles.center}>
        {title}
      </ThemedText>
      {body ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {body}
        </ThemedText>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingHorizontal: Spacing.five, paddingVertical: Spacing.six, gap: Spacing.two },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
  center: { textAlign: 'center' },
  action: { marginTop: Spacing.three, alignSelf: 'stretch' },
});
