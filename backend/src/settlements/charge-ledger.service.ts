import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActorKind, ChargeSource, IapPlatform } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';
import { addMonths, allocateCharge, type ChargeRoom } from './allocate-charge.js';

type Db = Prisma.TransactionClient | PrismaService;

const ROOM_SELECT = { id: true, kind: true, monthlyPriceCents: true, coupleMembers: { select: { memberId: true } } } as const;
const PURCHASE_SELECT = {
  id: true,
  actorId: true,
  bundleId: true,
  priceCents: true,
  startedAt: true,
  cancelledAt: true,
  iapPlatform: true,
  iapExpiresAt: true,
  actor: { select: { ...ROOM_SELECT, legalName: true } },
  bundle: { select: { name: true, priceCents: true, actors: { select: { actor: { select: ROOM_SELECT } } } } },
} as const;
type PurchaseForCharge = Prisma.PurchaseGetPayload<{ select: typeof PURCHASE_SELECT }>;
type RoomRow = Prisma.ActorGetPayload<{ select: typeof ROOM_SELECT }>;

export interface ChargeInput {
  chargedAt: Date;
  periodEnd?: Date;
  source: ChargeSource;
  storeTransactionId?: string;
  amountCents?: number;
  currency?: string;
}

export function sourceOf(platform: IapPlatform | null): ChargeSource {
  return platform === IapPlatform.IOS ? ChargeSource.APPLE : platform === IapPlatform.ANDROID ? ChargeSource.GOOGLE : ChargeSource.SANDBOX;
}

function toChargeRoom(room: RoomRow): ChargeRoom {
  return {
    id: room.id,
    monthlyPriceCents: room.monthlyPriceCents,
    memberIds: room.kind === ActorKind.COUPLE ? room.coupleMembers.map((member) => member.memberId) : [room.id],
  };
}

/**
 * 결제 기록(정산의 기준, 2026-09-29). 결제 1건마다 PurchaseCharge 한 줄 + 배우별 몫(ChargeAllocation)을 결제 순간 기준으로 고정.
 * - 첫 결제: 구매가 생길 때(SubscriptionsService) 바로 기록.
 * - 갱신: 스토어 결제는 스토어 알림·영수증 재검증이 기록(storeTransactionId로 중복 방지), 샌드박스는 fillMissing이 매달 흉내.
 * - 이 표가 생기기 전 구매·기록이 빠진 구매는 fillMissing(서버 시작 시·매시간)이 채움. 같은 구매·같은 시각은 한 번만(고유 제약).
 */
@Injectable()
export class ChargeLedgerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChargeLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    // 시작을 늦추지 않게 기다리지 않음
    void this.fillMissing().catch((error: unknown) => this.logger.error(`결제 기록 채우기 실패: ${String(error)}`));
  }

  /** 결제 1건 기록 — 이미 있으면(같은 구매·시각 또는 같은 스토어 결제 id) 기존 것을 돌려줌 */
  async record(db: Db, purchaseId: string, input: ChargeInput) {
    const purchase = await db.purchase.findUniqueOrThrow({ where: { id: purchaseId }, select: PURCHASE_SELECT });
    return this.recordFor(db, purchase, input);
  }

  private async recordFor(db: Db, purchase: PurchaseForCharge, input: ChargeInput) {
    const existing = await db.purchaseCharge.findFirst({
      where: {
        OR: [
          { purchaseId: purchase.id, chargedAt: input.chargedAt },
          ...(input.storeTransactionId ? [{ storeTransactionId: input.storeTransactionId }] : []),
        ],
      },
    });
    if (existing) return existing;

    const rooms = purchase.actor ? [purchase.actor] : (purchase.bundle?.actors.map((item) => item.actor) ?? []);
    const amountCents = input.amountCents ?? purchase.priceCents ?? purchase.bundle?.priceCents ?? purchase.actor?.monthlyPriceCents ?? 0;
    const lines = allocateCharge(amountCents, rooms.map(toChargeRoom));
    const agencies = await this.agenciesAt(db, [...new Set(lines.map((line) => line.actorId))], input.chargedAt);
    try {
      return await db.purchaseCharge.create({
        data: {
          purchaseId: purchase.id,
          actorId: purchase.actorId,
          bundleId: purchase.bundleId,
          productName: purchase.bundle?.name ?? purchase.actor?.legalName ?? '',
          amountCents,
          currency: input.currency ?? 'THB',
          chargedAt: input.chargedAt,
          periodEnd: input.periodEnd ?? addMonths(input.chargedAt, 1),
          source: input.source,
          storeTransactionId: input.storeTransactionId,
          allocations: { create: lines.map((line) => ({ ...line, agencyId: agencies.get(line.actorId) ?? null })) },
        },
      });
    } catch (error) {
      // 다른 서버가 같은 결제를 먼저 기록함 — 그걸 돌려줌
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return db.purchaseCharge.findFirstOrThrow({
          where: {
            OR: [
              { purchaseId: purchase.id, chargedAt: input.chargedAt },
              ...(input.storeTransactionId ? [{ storeTransactionId: input.storeTransactionId }] : []),
            ],
          },
        });
      }
      throw error;
    }
  }

  /**
   * 결제 순간 각 배우의 소속사 — 이적 기록(ActorAgencyHistory)이 있으면 그 시점 기록으로(그 시점에 무소속이었으면 null), 기록이
   * 아예 없는 배우(이력 기능 전 배정)는 지금 소속사로.
   */
  private async agenciesAt(db: Db, actorIds: string[], at: Date): Promise<Map<string, string | null>> {
    if (actorIds.length === 0) return new Map();
    const [history, actors] = await Promise.all([
      db.actorAgencyHistory.findMany({ where: { actorId: { in: actorIds } }, orderBy: { startedAt: 'desc' } }),
      db.actor.findMany({ where: { id: { in: actorIds } }, select: { id: true, agencyId: true } }),
    ]);
    return new Map(
      actors.map((actor) => {
        const rows = history.filter((row) => row.actorId === actor.id);
        if (rows.length === 0) return [actor.id, actor.agencyId] as const;
        const hit = rows.find((row) => row.startedAt <= at && (!row.endedAt || row.endedAt > at));
        return [actor.id, hit?.agencyId ?? null] as const;
      }),
    );
  }

  /**
   * 빠진 결제 기록 채우기 — 샌드박스 구매는 시작일부터 매달(해지 전·지금 이전까지) 한 건씩, 스토어 구매는 기록이 하나도 없으면
   * 첫 결제 한 건(이후 갱신은 스토어 알림이 기록). 몇 번 돌아도 결과가 같음.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async fillMissing(now = new Date()) {
    const purchases = await this.prisma.purchase.findMany({
      where: { OR: [{ iapPlatform: null }, { charges: { none: {} } }] },
      select: { ...PURCHASE_SELECT, charges: { select: { chargedAt: true } } },
    });
    let created = 0;
    for (const purchase of purchases) {
      const have = new Set(purchase.charges.map((charge) => charge.chargedAt.getTime()));
      const source = sourceOf(purchase.iapPlatform);
      if (source !== ChargeSource.SANDBOX) {
        if (have.size === 0) {
          await this.recordFor(this.prisma, purchase, { chargedAt: purchase.startedAt, periodEnd: purchase.iapExpiresAt ?? undefined, source });
          created += 1;
        }
        continue;
      }
      const end = purchase.cancelledAt && purchase.cancelledAt < now ? purchase.cancelledAt : now;
      for (let k = 0; ; k += 1) {
        const chargedAt = addMonths(purchase.startedAt, k);
        if (chargedAt > end || (k > 0 && chargedAt.getTime() === end.getTime())) break;
        if (have.has(chargedAt.getTime())) continue;
        await this.recordFor(this.prisma, purchase, { chargedAt, source });
        created += 1;
      }
    }
    if (created > 0) this.logger.log(`결제 기록 ${created}건 채움`);
    return created;
  }
}
