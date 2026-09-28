import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import type { ReplyPreview } from '@/hooks/use-studio';

const ROTATE_MS = 2500;
const SLIDE_PX = 14;

/**
 * 스타 메시지 아래 "팬 답장 흐름" — 버블·위버스처럼 최근 팬 답장이 한 줄씩 위로 넘어가며 바뀌고, 누르면 답장 목록.
 * 새 답장이 들어오면(폴링) 바로 그 답장으로 넘어감. 기기에서 "동작 줄이기"를 켰으면 넘어가는 효과 없이 바뀜.
 */
export function ReplyTicker({ replies, count, onPress }: { replies: ReplyPreview[]; count: number; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const latestId = replies[replies.length - 1]?.id;
  // 최신 답장에서 시작해 한 칸씩 넘어감(끝나면 오래된 것부터 다시). 새 답장이 오면(latestId가 바뀌면) 최신부터 다시
  const [cursor, setCursor] = useState({ latestId, offset: 0 });
  const offset = cursor.latestId === latestId ? cursor.offset : 0;
  const index = replies.length > 0 ? (replies.length - 1 + offset) % replies.length : 0;
  const [progress] = useState(() => new Animated.Value(1));
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (replies.length < 2) return;
    const timer = setInterval(
      () => setCursor((c) => ({ latestId, offset: (c.latestId === latestId ? c.offset : 0) + 1 })),
      ROTATE_MS,
    );
    return () => clearInterval(timer);
  }, [replies.length, latestId]);

  useEffect(() => {
    if (reduceMotion) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 280, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [index, latestId, progress, reduceMotion]);

  const reply = replies[index];
  if (!reply) return null;
  const nickname = reply.nickname ?? t('console.noNickname');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('studio.replies', { count })}. ${nickname}: ${reply.body}`}
      style={styles.pressable}>
      <ThemedView style={[styles.box, { backgroundColor: theme.backgroundElement }]}>
        <Animated.View
          style={[
            styles.line,
            {
              opacity: progress,
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [SLIDE_PX, 0] }) }],
            },
          ]}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.nickname}>
            {nickname}
          </ThemedText>
          <ThemedText type="small" numberOfLines={1} style={styles.body}>
            {reply.body}
          </ThemedText>
        </Animated.View>
        <ThemedText type="smallBold" style={[styles.count, { color: theme.tint }]}>
          {t('studio.replies', { count })} ›
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setEnabled)
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setEnabled);
    return () => subscription.remove();
  }, []);
  return enabled;
}

const styles = StyleSheet.create({
  pressable: { alignSelf: 'stretch', alignItems: 'flex-end' },
  box: {
    width: '80%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    overflow: 'hidden',
  },
  line: { flex: 1, flexDirection: 'row', gap: Spacing.one, alignItems: 'center' },
  nickname: { flexShrink: 0, maxWidth: '40%' },
  body: { flex: 1 },
  count: { flexShrink: 0 },
});
