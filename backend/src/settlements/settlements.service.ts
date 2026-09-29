import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChargeSource, Role } from '../generated/prisma/enums.js';
import { appError } from '../common/i18n/app-error.js';

// 정산의 "한 달"은 태국 시간 기준(통계와 같음, 서머타임 없는 UTC+7)
const ZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function monthRange(month: string): { from: Date; to: Date } {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new BadRequestException(appError('SETTLEMENT_MONTH_INVALID'));
  const [year, mon] = [Number(match[1]), Number(match[2])];
  return { from: new Date(Date.UTC(year, mon - 1, 1) - ZONE_OFFSET_MS), to: new Date(Date.UTC(year, mon, 1) - ZONE_OFFSET_MS) };
}

/** 금액 나누기 — 스토어 수수료 → 남은 금액을 소속사 몫 / 토피 몫으로. 반올림은 소속사 쪽이 아닌 토피 몫에서 맞춤 */
export function splitRevenue(grossCents: number, storeFeePercent: number, sharePercent: number) {
  const storeFeeCents = Math.round((grossCents * storeFeePercent) / 100);
  const netCents = grossCents - storeFeeCents;
  const payoutCents = Math.round((netCents * sharePercent) / 100);
  return { grossCents, storeFeeCents, netCents, payoutCents, platformCents: netCents - payoutCents };
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
  refundedCents: number;
  rooms: Map<string, { roomId: string; name: string; kind: string; grossCents: number }>;
}

/**
 * 월 정산(2026-09-29) — 결제 기록(PurchaseCharge)의 배우별 몫(ChargeAllocation)을 결제 순간의 소속사별로 모아
 * 스토어 수수료(STORE_FEE_PERCENT, 잠정 15) → 소속사 몫(소속사별 revenueSharePercent, 없으면 AGENCY_REVENUE_SHARE_PERCENT, 잠정 70)
 * / 토피 몫으로 나눔. 무소속 배우는 배우 본인에게 같은 비율. 환불된 결제는 빼고 따로 보여 줌.
 * 금액은 표시 가격(바트) 기준 추정 — 실제 입금액(나라별 가격·환율·세금)은 스토어 정산 보고서로 맞춰 봐야 함.
 */
@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

  async report(month: string, options: { agencyId?: string; includeSandbox?: boolean } = {}) {
    const { from, to } = monthRange(month);
    const includeSandbox = options.includeSandbox ?? this.sandboxEnabled;
    const allocations = await this.prisma.chargeAllocation.findMany({
      where: {
        ...(options.agencyId ? { agencyId: options.agencyId } : {}),
        charge: { chargedAt: { gte: from, lt: to }, ...(includeSandbox ? {} : { source: { not: ChargeSource.SANDBOX } }) },
      },
      select: {
        chargeId: true,
        amountCents: true,
        agencyId: true,
        charge: { select: { refundedAt: true } },
        actor: { select: { id: true, legalName: true } },
        room: { select: { id: true, legalName: true, kind: true } },
        agency: { select: { id: true, name: true, revenueSharePercent: true } },
      },
    });

    const groups = new Map<string, { agencyId: string | null; name: string | null; sharePercent: number; actors: Map<string, ActorRow> }>();
    for (const line of allocations) {
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
        actor = { actorId: line.actor.id, name: line.actor.legalName, chargeIds: new Set(), grossCents: 0, refundedCents: 0, rooms: new Map() };
        group.actors.set(line.actor.id, actor);
      }
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

    const storeFeePercent = this.storeFeePercent;
    const agencies = [...groups.values()]
      .map((group) => {
        const actors = [...group.actors.values()]
          .map((actor) => ({
            actorId: actor.actorId,
            name: actor.name,
            chargeCount: actor.chargeIds.size,
            refundedCents: actor.refundedCents,
            ...splitRevenue(actor.grossCents, storeFeePercent, group.sharePercent),
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

  /** 엑셀에서 바로 열리는 CSV(한글 깨짐 방지 BOM) — 배우별 한 줄, detail이면 배우×방 한 줄 */
  toCsv(report: Awaited<ReturnType<SettlementsService['report']>>, detail = false): string {
    const money = (cents: number) => (cents / 100).toFixed(2);
    const header = detail
      ? ['month', 'agency', 'share_percent', 'actor', 'room', 'room_kind', 'gross']
      : ['month', 'agency', 'share_percent', 'actor', 'charges', 'gross', 'store_fee', 'net', 'payout', 'platform', 'refunded'];
    const rows = report.agencies.flatMap((agency) =>
      agency.actors.flatMap((actor) =>
        detail
          ? actor.rooms.map((room) => [report.month, agency.name ?? '-', agency.sharePercent, actor.name, room.name, room.kind, money(room.grossCents)])
          : [
              [
                report.month,
                agency.name ?? '-',
                agency.sharePercent,
                actor.name,
                actor.chargeCount,
                money(actor.grossCents),
                money(actor.storeFeeCents),
                money(actor.netCents),
                money(actor.payoutCents),
                money(actor.platformCents),
                money(actor.refundedCents),
              ],
            ],
      ),
    );
    const escape = (value: string | number) => {
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return '﻿' + [header, ...rows].map((row) => row.map(escape).join(',')).join('\n') + '\n';
  }
}

function sum(rows: { grossCents: number; storeFeeCents: number; netCents: number; payoutCents: number; platformCents: number; refundedCents: number }[]) {
  return rows.reduce(
    (acc, row) => ({
      grossCents: acc.grossCents + row.grossCents,
      storeFeeCents: acc.storeFeeCents + row.storeFeeCents,
      netCents: acc.netCents + row.netCents,
      payoutCents: acc.payoutCents + row.payoutCents,
      platformCents: acc.platformCents + row.platformCents,
      refundedCents: acc.refundedCents + row.refundedCents,
    }),
    { grossCents: 0, storeFeeCents: 0, netCents: 0, payoutCents: 0, platformCents: 0, refundedCents: 0 },
  );
}
