import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMe } from '@/hooks/use-onboarding';
import { SUPPORT_EMAIL } from '@/lib/env';
import { openSupportMail } from '@/lib/support';

/** "문의하기" — 메일 앱을 열어 고객센터로. 문의 주소가 아직 없으면 준비 중 안내만 */
export function SupportLink() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const [failed, setFailed] = useState(false);

  const open = () => {
    setFailed(false);
    openSupportMail(me?.id).catch(() => setFailed(true));
  };

  return (
    <ThemedView style={styles.container}>
      <Pressable accessibilityRole="button" onPress={open} disabled={!SUPPORT_EMAIL}>
        <ThemedText type="small" themeColor={SUPPORT_EMAIL ? 'text' : 'textSecondary'}>
          {t('support.contact')}
        </ThemedText>
      </Pressable>
      {!SUPPORT_EMAIL && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('support.notReady')}
        </ThemedText>
      )}
      {failed && (
        <ThemedText type="small" themeColor="danger">
          {t('support.openFailed', { email: SUPPORT_EMAIL })}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2, backgroundColor: 'transparent' },
});
