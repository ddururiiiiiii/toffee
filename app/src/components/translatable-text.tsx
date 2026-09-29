import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { useMessageTranslation } from '@/hooks/use-messages';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { needsTranslation } from '@/utils/detect-script';
import { Spacing } from '@/constants/theme';

/**
 * 말풍선 글 + 번역(2026-09-29) — 글이 지금 앱 언어와 다른 글자로 쓰였으면 아래에 "번역 보기". 누르면 번역이 원문 아래에 붙고, 다시 누르면
 * 접힘(원문은 항상 보임 — 번역이 틀릴 수 있어서). 팬 화면의 스타 메시지, 스타 화면의 팬 답장에 씀.
 */
export function TranslatableText({ actorId, messageId, text, display }: { actorId: string; messageId: string; text: string; display?: string }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const translatable = needsTranslation(text, i18n.language);
  const translation = useMessageTranslation(actorId, messageId, i18n.language, translatable && open);

  return (
    <View>
      <ThemedText>{display ?? text}</ThemedText>
      {translatable ? (
        <>
          {open && translation.data ? (
            <View style={[styles.translation, { borderTopColor: theme.border }]}>
              <ThemedText themeColor="textSecondary">{translation.data.text}</ThemedText>
            </View>
          ) : null}
          {open && translation.isError ? (
            <ThemedText type="caption" themeColor="danger" style={styles.error}>
              {translation.error instanceof ApiError ? translation.error.message : t('translate.failed')}
            </ThemedText>
          ) : null}
          <Pressable onPress={() => setOpen(!open)} hitSlop={6} accessibilityRole="button" style={styles.link}>
            {open && translation.isFetching ? (
              <ActivityIndicator size="small" color={theme.textTertiary} />
            ) : (
              <Icon as={Languages} size={13} color={theme.textTertiary} />
            )}
            <ThemedText type="caption" themeColor="textTertiary">
              {open ? t('translate.hide') : t('translate.show')}
            </ThemedText>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  translation: { marginTop: Spacing.two, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.one },
  error: { marginTop: Spacing.one },
});
