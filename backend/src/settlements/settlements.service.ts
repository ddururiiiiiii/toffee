import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChargeSource, Role } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { appError } from '../common/i18n/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { SettlementPayoutDto } from './dto.js';

// 정산의 "한 달"은 태국 시간 기준(통계와 같음, 서머타임 없는 UTC+7)
const ZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function monthRange(month: string): { from: Date; to: Date } {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new BadRequestException(appError('SETTLEMENT_MONTH_INVALID'));
  const [year, mon] = [Number(match[1]), Number(match[2])];
  return { from: new Date(Date.UTC(year, mon - 1, 1) - ZONE_OFFSET_MS), to: new Date(Date.UTC(year, mon, 1) - ZONE_OFFSET_MS) };
}

/** 이 시각이 속한 달(태국 시간) YYYY-MM */
export function monthOf(date: Date): string {
  const local = new Date(date.getTime() + ZONE_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * 금액 나누기 — 정산 대상 금액(이 달 결제액 + 조정)에서 스토어 수수료 → 남은 금액을 소속사 몫 / 토피 몫으로. 반올림은 소속사 쪽이 아닌
 * 토피 몫에서 맞춤. 조정 때문에 음수일 수 있음(지난달 마감 뒤 환불이 이 달 결제보다 많으면 지급액이 음수 = 다음 지급에서 차감).
 */
export function splitRevenue(baseCents: number, storeFeePercent: number, sharePercent: number) {
  const storeFeeCents = Math.round((baseCents * storeFeePercent) / 100);
  const netCents = baseCents - storeFeeCents;
  const payoutCents = Math.round((netCents * sharePercent) / 100);
  return { storeFeeCents, netCents, payoutCents, platformCents: netCents - payoutCents };
}

function percentFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : fallback;
}

interface ActorRow {
  actorId: string;
  name: string;
  chargeIds: Set<string>;
  grossCents: number;
  adjustmentCents: number;
  refundedCents: number;
  rooms: Map<string, { roomId: string; name: string; kind: string; grossCents: number }>;
}

interface Amounts {
  grossCents: number;
  adjustmentCents: number;
  storeFeeCents: number;
  netCents: number;
  payoutCents: number;
  platformCents: number;
  refundedCents: number;
}

type LiveReport = Awaited<ReturnType<SettlementsService['compute']>>;
export interface PayoutRecord {
  id: string;
  agencyId: string | null;
  actorId: string | null;
  name: string;
  amountCents: number;
  paidAt: string;
  reference: string | null;
  memo: string | null;
}
export type SettlementReport = LiveReport & {
  closed: { at: string; byId: string | null; byName: string | null } | null;
  // 지급 기록(마감한 달에만) — 소속사 직원에겐 자기 소속사 것만
  payouts: PayoutRecord[];
};

const PAYOUT_SELECT = { id: true, agencyId: true, actorId: true, name: true, amountCents: true, paidAt: true, reference: true, memo: true } as const;

const ALLOCATION_SELECT = {
  chargeId: true,
  amountCents: true,
  agencyId: true,
  charge: { select: { chargedAt: true, createdAt: true, refundedAt: true } },
  actor: { select: { id: true, legalName: true } },
  room: { select: { id: true, legalName: true, kind: true } },
  agency: { select: { id: true, name: true, revenueSharePercent: true } },
} as const;
type AllocationLine = Prisma.ChargeAllocationGetPayload<{ select: typeof ALLOCATION_SELECT }>;

/**
 * 월 정산(2026-09-29) — 결제 기록(PurchaseCharge)의 배우별 몫(ChargeAllocation)을 결제 순간의 소속사별로 모아
 * 스토어 수수료(STORE_FEE_PERCENT, 잠정 15) → 소속사 몫(소속사별 revenueSharePercent, 없으면 AGENCY_REVENUE_SHARE_PERCENT, 잠정 70)
 * / 토피 몫으로 나눔. 무소속 배우는 배우 본인에게 같은 비율. 환불된 결제는 빼고 따로 보여 줌.
 * 마감(SettlementClose): 마감한 달은 저장해 둔 표를 그대로 보여 주고, 마감 뒤에 생긴 일(환불·늦게 기록된 결제)은 그 일이 생긴 열린 달의
 * "조정"으로. 금액은 표시 가격(바트) 기준 추정 — 실제 입금액은 스토어 정산 보고서로 맞춰 봐야 함.
 */
@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  get storeFeePercent() {
    return percentFrom(this.config.get<string>('STORE_FEE_PERCENT'), 15);
  }

  get defaultSharePercent() {
    return percentFrom(this.config.get<string>('AGENCY_REVENUE_SHARE_PERCENT'), 70);
  }

  // 샌드박스 구독이 켜진 환경(개발·데모)에선 기본으로 테스트 결제도 보여 줌 — 운영에선 꺼져 있으니 기본 제외
  get sandboxEnabled() {
    return this.config.get<string>('ENABLE_SANDBOX_SUBSCRIBE') === 'true';
  }

  /** 소속사 직원이면 자기 소속사로만 좁힘(운영자는 전체) */
  async scopeFor(requesterId: string): Promise<{ agencyId?: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: requesterId }, select: { role: true, agencyId: true } });
    if (user.role === Role.ADMIN) return {};
    if (user.role === Role.AGENCY_STAFF && user.agencyId) return { agencyId: user.agencyId };
    throw new ForbiddenException(appError('FORBIDDEN'));
  }

  /** 월 정산표 — 마감한 달이면 마감 때 저장한 표(소속사 범위만 다시 좁힘), 아니면 지금 계산 */
  async report(month: string, options: { agencyId?: string; includeSandbox?: boolean } = {}): Promise<SettlementReport> {
    monthRange(month);
    const close = await this.prisma.settlementClose.findUnique({ where: { month } });
    if (close) {
      const snapshot = close.snapshot as unknown as LiveReport;
      const agencies = options.agencyId ? snapshot.agencies.filter((agency) => agency.agencyId === options.agencyId) : snapshot.agencies;
      const [closer, payouts] = await Promise.all([
        close.closedById ? this.prisma.user.findUnique({ where: { id: close.closedById }, select: { displayName: true } }) : null,
        this.prisma.settlementPayout.findMany({
          where: { month, ...(options.agencyId ? { agencyId: options.agencyId } : {}) },
          select: PAYOUT_SELECT,
          orderBy: { paidAt: 'asc' },
        }),
      ]);
      return {
        ...snapshot,
        sandboxEnabled: this.sandboxEnabled,
        agencies,
        totals: sum(agencies),
        closed: { at: close.closedAt.toISOString(), byId: close.closedById, byName: closer?.displayName ?? null },
        payouts: payouts.map((payout) => ({ ...payout, paidAt: payout.paidAt.toISOString() })),
      };
    }
    return { ...(await this.compute(month, options)), closed: null, payouts: [] };
  }

  /** 지금 기준으로 계산(마감 안 한 달) — 이 달 결제 + 마감된 지난달에서 넘어온 조정 */
  async compute(month: string, options: { agencyId?: string; includeSandbox?: boolean } = {}) {
    const { from, to } = monthRange(month);
    const includeSandbox = options.includeSandbox ?? this.sandboxEnabled;
    const agencyWhere = options.agencyId ? { agencyId: options.agencyId } : {};
    const sourceWhere = includeSandbox ? {} : { source: { not: ChargeSource.SANDBOX } };
    const [current, earlier, closes] = await Promise.all([
      this.prisma.chargeAllocation.findMany({
        where: { ...agencyWhere, charge: { chargedAt: { gte: from, lt: to }, ...sourceWhere } },
        select: ALLOCATION_SELECT,
      }),
      // 지난달 결제 중 이 달에 늦게 기록됐거나 이 달에 환불된 것 — 그 달이 이미 마감됐으면 이 달 조정으로
      this.prisma.chargeAllocation.findMany({
        where: {
          ...agencyWhere,
          charge: { chargedAt: { lt: from }, ...sourceWhere, OR: [{ createdAt: { gte: from, lt: to } }, { refundedAt: { gte: from, lt: to } }] },
        },
        select: ALLOCATION_SELECT,
      }),
      this.prisma.settlementClose.findMany({ select: { month: true, closedAt: true } }),
    ]);
    const closedAt = new Map(closes.map((close) => [close.month, close.closedAt]));

    const groups = new Map<string, { agencyId: string | null; name: string | null; sharePercent: number; actors: Map<string, ActorRow> }>();
    const rowFor = (line: AllocationLine) => {
      const key = line.agencyId ?? '';
      let group = groups.get(key);
      if (!group) {
        group = {
          agencyId: line.agencyId,
          name: line.agency?.name ?? null,
          sharePercent: line.agency?.revenueSharePercent ?? this.defaultSharePercent,
          actors: new Map(),
        };
        groups.set(key, group);
      }
      let actor = group.actors.get(line.actor.id);
      if (!actor) {
        actor = { actorId: line.actor.id, name: line.actor.legalName, chargeIds: new Set(), grossCents: 0, adjustmentCents: 0, refundedCents: 0, rooms: new Map() };
        group.actors.set(line.actor.id, actor);
      }
      return actor;
    };

    for (const line of current) {
      const actor = rowFor(line);
      if (line.charge.refundedAt) {
        actor.refundedCents += line.amountCents;
        continue;
      }
      actor.chargeIds.add(line.chargeId);
      actor.grossCents += line.amountCents;
      const room = actor.rooms.get(line.room.id) ?? { roomId: line.room.id, name: line.room.legalName, kind: line.room.kind, grossCents: 0 };
      room.grossCents += line.amountCents;
      actor.rooms.set(line.room.id, room);
    }
    for (const line of earlier) {
      const closed = closedAt.get(monthOf(line.charge.chargedAt));
      // 그 달이 아직 안 마감됐으면 그 달 정산에 그대로 들어감 — 조정 아님
      if (!closed) continue;
      const inMonth = (date: Date | null) => !!date && date >= from && date < to && date > closed;
      const late = inMonth(line.charge.createdAt) ? line.amountCents : 0;
      const refunded = inMonth(line.charge.refundedAt) ? line.amountCents : 0;
      if (late === 0 && refunded === 0) continue;
      rowFor(line).adjustmentCents += late - refunded;
    }

    const storeFeePercent = this.storeFeePercent;
    const agencies = [...groups.values()]
      .map((group) => {
        const actors = [...group.actors.values()]
          .map((actor) => ({
            actorId: actor.actorId,
            name: actor.name,
            chargeCount: actor.chargeIds.size,
            grossCents: actor.grossCents,
            adjustmentCents: actor.adjustmentCents,
            refundedCents: actor.refundedCents,
            ...splitRevenue(actor.grossCents + actor.adjustmentCents, storeFeePercent, group.sharePercent),
            rooms: [...actor.rooms.values()].sort((a, b) => b.grossCents - a.grossCents),
          }))
          .sort((a, b) => b.grossCents - a.grossCents);
        return { agencyId: group.agencyId, name: group.name, sharePercent: group.sharePercent, ...sum(actors), actors };
      })
      // 소속사 이름순, 무소속은 맨 뒤
      .sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name)));

    return {
      month,
      currency: 'THB',
      storeFeePercent,
      defaultSharePercent: this.defaultSharePercent,
      includesSandbox: includeSandbox,
      sandboxEnabled: this.sandboxEnabled,
      totals: sum(agencies),
      agencies,
    };
  }

  /**
   * 한 달 마감(운영자) — 끝난 달만, 앞 달부터 순서대로(앞 달이 열려 있으면 그 달의 조정이 어디로 갈지 꼬여서). 마감 순간의 전체 정산표를
   * 저장. 지급은 마감한 표(CSV) 기준으로.
   */
  async close(adminId: string, month: string, includeSandbox?: boolean, now = new Date()) {
    const { from, to } = monthRange(month);
    if (to > now) throw new BadRequestException(appError('SETTLEMENT_NOT_ENDED'));
    if (await this.prisma.settlementClose.findUnique({ where: { month } })) throw new ConflictException(appError('SETTLEMENT_ALREADY_CLOSED'));
    const openBefore = await this.openMonthsBefore(from);
    if (openBefore.length > 0) throw new ConflictException(appError('SETTLEMENT_CLOSE_ORDER', { month: openBefore[0] }));
    const snapshot = await this.compute(month, { includeSandbox });
    await this.prisma.settlementClose.create({ data: { month, closedById: adminId, snapshot: snapshot as unknown as Prisma.InputJsonValue } });
    await this.audit.record(adminId, 'SETTLEMENT_CLOSE', 'SETTLEMENT', month, { month, payoutCents: snapshot.totals.payoutCents });
    return this.report(month);
  }

  /** 마감 취소(운영자, 지급 전 실수 바로잡기) — 뒤 달이 이미 마감돼 있으면 뒤 달부터 */
  async reopen(adminId: string, month: string) {
    monthRange(month);
    const close = await this.prisma.settlementClose.findUnique({ where: { month } });
    if (!close) throw new ConflictException(appError('SETTLEMENT_NOT_CLOSED'));
    const later = await this.prisma.settlementClose.findFirst({ where: { month: { gt: month } }, orderBy: { month: 'asc' } });
    if (later) throw new ConflictException(appError('SETTLEMENT_REOPEN_ORDER', { month: later.month }));
    // 이미 돈을 보낸 달을 다시 열면 표가 바뀌어 지급액과 어긋남 — 차이는 다음 달 조정으로
    if ((await this.prisma.settlementPayout.count({ where: { month } })) > 0) throw new ConflictException(appError('SETTLEMENT_REOPEN_PAID'));
    await this.prisma.settlementClose.delete({ where: { month } });
    await this.audit.record(adminId, 'SETTLEMENT_REOPEN', 'SETTLEMENT', month, { month });
    return this.report(month);
  }

  /**
   * 지급 기록(운영자) — 마감한 달만. 받는 쪽은 마감한 표에 지급액(양수)이 있는 소속사, 또는 무소속 배우 본인(무소속은 배우마다 따로 보냄).
   * 금액은 안 적으면 표의 지급액 그대로. 실제 송금은 은행에서 하고 여기엔 기록만.
   */
  async recordPayout(adminId: string, month: string, dto: SettlementPayoutDto, now = new Date()) {
    monthRange(month);
    const close = await this.prisma.settlementClose.findUnique({ where: { month } });
    if (!close) throw new ConflictException(appError('SETTLEMENT_NOT_CLOSED'));
    const snapshot = close.snapshot as unknown as LiveReport;
    const payee = payeeIn(snapshot, dto);
    if (!payee || payee.payoutCents <= 0) throw new BadRequestException(appError('SETTLEMENT_PAYOUT_INVALID'));
    const payeeKey = dto.agencyId ? `agency:${dto.agencyId}` : `actor:${dto.actorId}`;
    if (await this.prisma.settlementPayout.findUnique({ where: { month_payeeKey: { month, payeeKey } } })) {
      throw new ConflictException(appError('SETTLEMENT_PAYOUT_EXISTS'));
    }
    const amountCents = dto.amountCents ?? payee.payoutCents;
    const payout = await this.prisma.settlementPayout.create({
      data: {
        month,
        agencyId: dto.agencyId ?? null,
        actorId: dto.agencyId ? null : (dto.actorId ?? null),
        payeeKey,
        name: payee.name,
        amountCents,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : now,
        reference: dto.reference?.trim() || null,
        memo: dto.memo?.trim() || null,
        recordedById: adminId,
      },
      select: PAYOUT_SELECT,
    });
    await this.audit.record(adminId, 'SETTLEMENT_PAYOUT', 'SETTLEMENT', month, { month, payee: payee.name, amountCents, expectedCents: payee.payoutCents });
    return { ...payout, paidAt: payout.paidAt.toISOString() };
  }

  /** 잘못 적은 지급 기록 지우기(운영자) — 기록만 지우는 것(송금 취소 아님), 운영자 작업 기록엔 남음 */
  async deletePayout(adminId: string, month: string, payoutId: string) {
    const payout = await this.prisma.settlementPayout.findFirst({ where: { id: payoutId, month } });
    if (!payout) throw new NotFoundException(appError('NOT_FOUND'));
    await this.prisma.settlementPayout.delete({ where: { id: payoutId } });
    await this.audit.record(adminId, 'SETTLEMENT_PAYOUT_DELETE', 'SETTLEMENT', month, { month, payee: payout.name, amountCents: payout.amountCents });
  }

  /** 이 달보다 앞선 달 중 결제가 있는데 아직 마감 안 한 달(오래된 순) */
  private async openMonthsBefore(before: Date): Promise<string[]> {
    const first = await this.prisma.purchaseCharge.findFirst({ where: { chargedAt: { lt: before } }, orderBy: { chargedAt: 'asc' }, select: { chargedAt: true } });
    if (!first) return [];
    const closed = new Set((await this.prisma.settlementClose.findMany({ select: { month: true } })).map((close) => close.month));
    const months: string[] = [];
    for (let month = monthOf(first.chargedAt); monthRange(month).from < before; month = nextMonth(month)) {
      if (!closed.has(month)) months.push(month);
    }
    return months;
  }

  /** 엑셀에서 바로 열리는 CSV(한글 깨짐 방지 BOM) — 배우별 한 줄, detail이면 배우×방 한 줄 */
  toCsv(report: SettlementReport, detail = false): string {
    const money = (cents: number) => (cents / 100).toFixed(2);
    const status = report.closed ? `closed ${report.closed.at}` : 'open';
    const header = detail
      ? ['month', 'status', 'agency', 'share_percent', 'actor', 'room', 'room_kind', 'gross']
      : ['month', 'status', 'agency', 'share_percent', 'actor', 'charges', 'gross', 'adjustment', 'store_fee', 'net', 'payout', 'platform', 'refunded', 'paid_at'];
    // 지급 기록 — 소속사는 소속사 단위, 무소속은 배우 단위로 보냄
    const paidAt = (agencyId: string | null, actorId: string) =>
      report.payouts.find((payout) => (agencyId ? payout.agencyId === agencyId : payout.actorId === actorId))?.paidAt ?? '';
    const rows = report.agencies.flatMap((agency) =>
      agency.actors.flatMap((actor) =>
        detail
          ? actor.rooms.map((room) => [report.month, status, agency.name ?? '-', agency.sharePercent, actor.name, room.name, room.kind, money(room.grossCents)])
          : [
              [
                report.month,
                status,
                agency.name ?? '-',
                agency.sharePercent,
                actor.name,
                actor.chargeCount,
                money(actor.grossCents),
                money(actor.adjustmentCents ?? 0),
                money(actor.storeFeeCents),
                money(actor.netCents),
                money(actor.payoutCents),
                money(actor.platformCents),
                money(actor.refundedCents),
                paidAt(agency.agencyId, actor.actorId),
              ],
            ],
      ),
    );
    const escape = (value: string | number) => {
      let text = String(value);
      // 이름이 =, +, -, @로 시작하면 엑셀이 수식으로 실행할 수 있음(CSV 수식 주입) — 숫자가 아닌 글자는 앞에 '를 붙여 글자로(2026-09-29 점검)
      if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return '﻿' + [header, ...rows].map((row) => row.map(escape).join(',')).join('\n') + '\n';
  }
}

/** 마감한 표에서 받는 쪽 찾기 — 소속사 합계, 또는 무소속 그룹 안의 배우 한 명 */
function payeeIn(snapshot: LiveReport, dto: { agencyId?: string; actorId?: string }): { name: string; payoutCents: number } | null {
  if (!!dto.agencyId === !!dto.actorId) return null;
  if (dto.agencyId) {
    const agency = snapshot.agencies.find((row) => row.agencyId === dto.agencyId);
    return agency ? { name: agency.name ?? '-', payoutCents: agency.payoutCents } : null;
  }
  const actor = snapshot.agencies.find((row) => row.agencyId === null)?.actors.find((row) => row.actorId === dto.actorId);
  return actor ? { name: actor.name, payoutCents: actor.payoutCents } : null;
}

export function nextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`;
}

function sum(rows: Partial<Amounts>[]): Amounts {
  return rows.reduce<Amounts>(
    (acc, row) => ({
      grossCents: acc.grossCents + (row.grossCents ?? 0),
      adjustmentCents: acc.adjustmentCents + (row.adjustmentCents ?? 0),
      storeFeeCents: acc.storeFeeCents + (row.storeFeeCents ?? 0),
      netCents: acc.netCents + (row.netCents ?? 0),
      payoutCents: acc.payoutCents + (row.payoutCents ?? 0),
      platformCents: acc.platformCents + (row.platformCents ?? 0),
      refundedCents: acc.refundedCents + (row.refundedCents ?? 0),
    }),
    { grossCents: 0, adjustmentCents: 0, storeFeeCents: 0, netCents: 0, payoutCents: 0, platformCents: 0, refundedCents: 0 },
  );
}
