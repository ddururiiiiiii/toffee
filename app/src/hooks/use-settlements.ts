import { Platform } from 'react-native';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface SettlementAmounts {
  grossCents: number;
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

/** 지금 달(태국 시간) YYYY-MM */
export function currentMonth(now = new Date()): string {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${bangkok.getUTCFullYear()}-${String(bangkok.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
