import { Platform } from 'react-native';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface SettlementAmounts {
  grossCents: number;
  // 마감된 지난달에서 넘어온 조정(마감 뒤 늦게 기록된 결제 +, 마감 뒤 환불 −) — 예전 마감 기록엔 없을 수 있음
  adjustmentCents?: number;
  storeFeeCents: number;
  netCents: number;
  payoutCents: number;
  platformCents: number;
  refundedCents: number;
}

export interface SettlementActor extends SettlementAmounts {
  actorId: string;
  name: string;
  chargeCount: number;
  rooms: { roomId: string; name: string; kind: 'SOLO' | 'COUPLE'; grossCents: number }[];
}

export interface SettlementAgency extends SettlementAmounts {
  agencyId: string | null;
  name: string | null;
  sharePercent: number;
  actors: SettlementActor[];
}

export interface SettlementReport {
  month: string;
  currency: string;
  storeFeePercent: number;
  defaultSharePercent: number;
  includesSandbox: boolean;
  sandboxEnabled: boolean;
  totals: SettlementAmounts;
  agencies: SettlementAgency[];
  /** 마감한 달이면 언제·누가(이 표는 마감 때 저장한 그대로) */
  closed: { at: string; byId: string | null; byName: string | null } | null;
  /** 지급 기록(마감한 달만) — 소속사는 소속사 단위(agencyId), 무소속은 배우 단위(actorId) */
  payouts: SettlementPayout[];
}

export interface SettlementPayout {
  id: string;
  agencyId: string | null;
  actorId: string | null;
  name: string;
  amountCents: number;
  paidAt: string;
  reference: string | null;
  memo: string | null;
}

export interface SettlementPayoutInput {
  agencyId?: string;
  actorId?: string;
  amountCents?: number;
  paidAt?: string;
  reference?: string;
  memo?: string;
}

export interface SettlementOptions {
  agencyId?: string;
  includeSandbox?: boolean;
}

function query(month: string, options: SettlementOptions, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ month, ...extra });
  if (options.agencyId) params.set('agencyId', options.agencyId);
  if (options.includeSandbox !== undefined) params.set('includeSandbox', String(options.includeSandbox));
  return params.toString();
}

/** 월 정산(운영자: 전체·소속사 골라 보기, 소속사 직원: 자기 소속사만 — 서버가 좁힘) */
export function useSettlement(month: string, options: SettlementOptions = {}) {
  return useQuery({
    queryKey: ['settlement', month, options.agencyId ?? null, options.includeSandbox ?? null],
    queryFn: () => apiClient.get<SettlementReport>(`/settlements?${query(month, options)}`),
    // 달을 넘길 때 표가 깜빡이지 않게 이전 달을 잠깐 보여 줌
    placeholderData: keepPreviousData,
    // 정산은 PC 웹에서만 보여 줌
    enabled: Platform.OS === 'web',
  });
}

/** 한 달 마감 / 마감 취소(운영자) */
export function useSettlementClose(month: string) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['settlement'] });
  return {
    close: useMutation({
      mutationFn: (includeSandbox?: boolean) =>
        apiClient.post<SettlementReport>(`/settlements/${month}/close${includeSandbox === undefined ? '' : `?includeSandbox=${includeSandbox}`}`),
      onSuccess: refresh,
    }),
    reopen: useMutation({ mutationFn: () => apiClient.delete<SettlementReport>(`/settlements/${month}/close`), onSuccess: refresh }),
  };
}

/** 지급 기록 남기기 / 잘못 적은 기록 지우기(운영자) */
export function useSettlementPayouts(month: string) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['settlement'] });
  return {
    record: useMutation({
      mutationFn: (input: SettlementPayoutInput) => apiClient.post<SettlementPayout>(`/settlements/${month}/payouts`, input),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (payoutId: string) => apiClient.delete(`/settlements/${month}/payouts/${payoutId}`), onSuccess: refresh }),
  };
}

/** CSV 내려받기(웹 전용 — 정산은 PC 웹에서만 보여 줌) */
export async function downloadSettlementCsv(month: string, options: SettlementOptions, detail: boolean) {
  const csv = await apiClient.getText(`/settlements/export?${query(month, options, detail ? { detail: 'true' } : {})}`);
  if (Platform.OS !== 'web') return;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `toffee-settlement-${month}${detail ? '-rooms' : ''}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { currentMonth, shiftMonth } from '@/utils/month';
