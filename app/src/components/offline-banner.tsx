import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNetworkState } from 'expo-network';
import { WifiOff } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';

/**
 * 인터넷 끊김 표시(2026-09-29) — 지하철 등에서 메시지가 안 오거나 전송이 실패할 때 "앱이 고장났나?" 대신 이유를 알게.
 * 화면 위쪽에 작게, 누르는 걸 막지 않음. 다시 연결되면 사라지고 목록은 자동으로 새로고침(react-query·실시간 재연결).
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const network = useNetworkState();
  // 모르는 상태(undefined)는 연결된 걸로 — 앱을 켜자마자 잠깐 뜨지 않게
  const offline = network.isConnected === false || network.isInternetReachable === false;
  if (!offline) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + Spacing.two }]}>
      <View style={styles.pill}>
        <Icon as={WifiOff} size={14} color="#ffffff" />
        <ThemedText type="captionBold" style={styles.text}>
          {t('network.offline')}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 900 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,17,21,0.88)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
  text: { color: '#ffffff' },
});
