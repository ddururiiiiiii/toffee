import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** 탭 화면 상단 — Toffee 워드마크(T Spark 포함) + 오른쪽 아이콘들. tagline이면 아래에 슬로건 */
export function BrandHeader({ right, tagline }: { right?: ReactNode; tagline?: string }) {
  const scheme = useColorScheme();
  return (
    <View style={styles.row}>
      <View>
        <Image
          source={scheme === 'dark' ? require('@/../assets/brand/wordmark-white.png') : require('@/../assets/brand/wordmark-black.png')}
          style={styles.wordmark}
          contentFit="contain"
          accessibilityLabel="Toffee"
        />
        {tagline ? (
          <ThemedText type="caption" themeColor="textSecondary" style={styles.tagline}>
            {tagline}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.actions}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  wordmark: { width: 104, height: 33 },
  tagline: { marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
