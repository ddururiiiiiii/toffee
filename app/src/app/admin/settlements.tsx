import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { SettlementReportView } from '@/components/settlement-report';
import { useAdminAgencies } from '@/hooks/use-admin';

/** 운영자 월 정산 — 전체 또는 소속사 하나(PC 웹 전용) */
export default function AdminSettlementsScreen() {
  const { data: agencies } = useAdminAgencies();
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SettlementReportView agencyFilter={agencies?.map((agency) => ({ id: agency.id, name: agency.name }))} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
