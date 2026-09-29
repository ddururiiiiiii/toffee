import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { SettlementReportView } from '@/components/settlement-report';

/** 소속사 월 정산 — 자기 소속사 배우만(서버가 좁힘), PC 웹 전용 */
export default function ConsoleSettlementsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SettlementReportView />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
