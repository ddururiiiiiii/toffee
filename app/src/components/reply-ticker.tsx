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
 * 스타 메시지 아래 "팬 답장 줄" — 버블·위버스처럼 팬 답장이 온 순서대로 한 줄씩 위로 넘어가며 보이고, 누르면 답장
 * 채팅 화면. 새 답장이 들어와도 건너뛰지 않고 순서가 되면 이어서 보여줌(끝까지 가면 처음부터 다시). 답장이 아직
 * 없으면 "기다리는 중" 줄. 기기에서 "동작 줄이기"를 켰으면 넘어가는 효과 없이 바뀜.
 */
export function ReplyTicker({ replies, count, onPress }: { replies: ReplyPreview[]; count: number; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  // 지금 보여주는 답장 id — 위치(index)가 아니라 id로 기억해야 새 답장이 붙거나 오래된 게 빠져도 순서가 안 꼬임
  const [currentId, setCurrentId] = useState<string | undefined>(replies[0]?.id);
  const found = replies.findIndex((r) => r.id === currentId);
  const index = found >= 0 ? found : 0;
  const reply = replies[index];
  const [progress] = useState(() => new Animated.Value(1));
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (replies.length < 2) return;
    const timer = setInterval(() => {
      setCurrentId((id) => {
        const at = replies.findIndex((r) => r.id === id);
        return replies[(at + 1) % replies.length].id;
      });
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [replies]);

  useEffect(() => {
    if (reduceMotion) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 280, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [reply?.id, progress, reduceMotion]);

  const nickname = reply ? (reply.nickname ?? t('console.noNickname')) : '';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={reply ? `${t('studio.replies', { count })}. ${nickname}: ${reply.body}` : t('studio.waitingReplies')}
      style={styles.pressable}>
      <ThemedView style={[styles.box, { backgroundColor: theme.backgroundElement }]}>
        {reply ? (
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
        ) : (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.body}>
            {t('studio.waitingReplies')}
          </ThemedText>
        )}
        {count > 0 && (
          <ThemedText type="smallBold" style={[styles.count, { color: theme.tint }]}>
            {t('studio.replies', { count })} ›
          </ThemedText>
        )}
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
  nickname: { flexShrink: 1, maxWidth: '50%' },
  body: { flex: 1 },
  count: { flexShrink: 0 },
});
