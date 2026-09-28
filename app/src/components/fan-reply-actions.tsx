import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { CornerUpLeft, MoreHorizontal, X } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui/icon-button';
import { useBlockFan } from '@/hooks/use-safety';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/confirm';

/**
 * 스타·소속사 화면의 팬 답장 한 줄에 붙는 ⋯ 메뉴 — (스타만) 답장하기(인용) / 신고(운영자 대기열로) / 이 채널에서
 * 차단(답장만 막힘).
 * 차단은 되돌릴 수 있고(차단 관리 화면), 구독·열람은 그대로라는 걸 확인 창에서 알려줌.
 */
export function FanReplyActions({ actorId, messageId, fanUserId, nickname, onQuote }: {
  actorId: string;
  messageId: string;
  fanUserId: string;
  nickname: string;
  /** 스타 화면에서만 — 이 답장을 인용해서 답장하기 */
  onQuote?: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const block = useBlockFan(actorId);

  const confirmBlock = async () => {
    const ok = await confirm(
      t('block.confirmTitle', { nickname }),
      t('block.confirmBody'),
      t('block.action'),
      t('common.cancel'),
    );
    if (ok) block.mutate(fanUserId, { onSuccess: () => setOpen(false) });
  };

  if (!open) {
    return (
      <IconButton icon={MoreHorizontal} size={18} label={t('safety.more')} color={theme.textTertiary} onPress={() => setOpen(true)} style={styles.more} />
    );
  }
  return (
    <View style={styles.row}>
      {onQuote && (
        <Pressable onPress={onQuote} hitSlop={8}>
          <View style={styles.item}>
            <CornerUpLeft size={15} color={theme.tint} />
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              {t('quote.action')}
            </ThemedText>
          </View>
        </Pressable>
      )}
      <Pressable onPress={() => router.push({ pathname: '/report', params: { messageId } })} hitSlop={8}>
        <ThemedText type="smallBold" themeColor="danger">
          {t('report.action')}
        </ThemedText>
      </Pressable>
      <Pressable onPress={confirmBlock} disabled={block.isPending} hitSlop={8}>
        <ThemedText type="smallBold" themeColor="danger">
          {t('block.action')}
        </ThemedText>
      </Pressable>
      <IconButton icon={X} size={16} label={t('chat.closeMenu')} color={theme.textTertiary} onPress={() => setOpen(false)} style={styles.more} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  more: { width: 28, height: 28 },
});
