import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChargeSource, MessageSenderType, RefundRequestStatus } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';
import { appError } from '../common/i18n/app-error.js';
import { IapVerificationService } from './iap-verification.service.js';
import { ChargeLedgerService } from '../settlements/charge-ledger.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const REASON = 'STAR_IDLE';
// 애플은 우리가 환불할 수 없음 — 팬이 직접 애플에 요청하는 공식 페이지
export const APPLE_REFUND_URL = 'https://reportaproblem.apple.com/';

const CHARGE_SELECT = {
  id: true,
  productName: true,
  amountCents: true,
  currency: true,
  chargedAt: true,
  periodEnd: true,
  source: true,
  storeTransactionId: true,
  allocations: { select: { roomId: true } },
  refundRequests: { where: { reason: REASON }, select: { status: true } },
} as const;
type ChargeRow = Prisma.PurchaseChargeGetPayload<{ select: typeof CHARGE_SELECT }>;

export interface IdleRefundCandidate {
  chargeId: string;
  productName: string;
  amountCents: number;
  currency: string;
  chargedAt: string;
  periodEnd: string;
  /** 이때까지 요청 가능 */
  deadline: string;
  source: ChargeSource;
  /** 애플 결제를 이미 안내받았으면 STORE_GUIDED */
  requested: RefundRequestStatus | null;
}

/**
 * 스타 미발송 환불(2026-09-29, 버블 방식 참고 — STATUS "출시 전 확정할 정책"):
 * 결제 한 건의 이용 기간(chargedAt ~ periodEnd) 동안 그 결제로 열린 방(묶음이면 모든 방)에 스타 메시지가 하나도 없었으면, 기간이 끝난 뒤
 * IDLE_REFUND_REQUEST_DAYS(기본 7)일 안에 팬이 환불을 요청할 수 있음. 팬 답장 여부는 안 따짐(못 받은 건 스타 메시지라서). 지운 메시지는 안 셈.
 * 환불: 테스트 결제는 바로 기록, 구글은 우리가 API로 그 결제만 환불(이용 중인 기간은 그대로), 애플은 우리가 못 하니 애플 환불 페이지로 안내.
 * 환불된 결제는 정산에서 자동으로 빠짐(마감한 달이면 다음 달 조정).
 */
@Injectable()
export class IdleRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly iap: IapVerificationService,
    private readonly ledger: ChargeLedgerService,
  ) {}

  get requestDays(): number {
    const value = Number(this.config.get<string>('IDLE_REFUND_REQUEST_DAYS'));
    return Number.isInteger(value) && value > 0 ? value : 7;
  }

  /** 지금 환불을 요청할 수 있는 내 결제들 */
  async candidates(userId: string, now = new Date()): Promise<IdleRefundCandidate[]> {
    const charges = await this.prisma.purchaseCharge.findMany({
      where: { refundedAt: null, purchase: { userId }, periodEnd: { lte: now, gt: new Date(now.getTime() - this.requestDays * DAY_MS) } },
      select: CHARGE_SELECT,
      orderBy: { periodEnd: 'desc' },
    });
    const result: IdleRefundCandidate[] = [];
    for (const charge of charges) {
      if (await this.starWasIdle(charge)) result.push(this.toCandidate(charge));
    }
    return result;
  }

  /** 그 기간에 스타 메시지가 0개였나 — 방 정보가 없는 결제는 판단할 수 없어서 대상 아님 */
  private async starWasIdle(charge: ChargeRow): Promise<boolean> {
    const rooms = [...new Set(charge.allocations.map((allocation) => allocation.roomId))];
    if (rooms.length === 0) return false;
    const sent = await this.prisma.message.count({
      where: { actorId: { in: rooms }, senderType: MessageSenderType.ARTIST, deletedAt: null, createdAt: { gte: charge.chargedAt, lt: charge.periodEnd } },
    });
    return sent === 0;
  }

  private toCandidate(charge: ChargeRow): IdleRefundCandidate {
    return {
      chargeId: charge.id,
      productName: charge.productName,
      amountCents: charge.amountCents,
      currency: charge.currency,
      chargedAt: charge.chargedAt.toISOString(),
      periodEnd: charge.periodEnd.toISOString(),
      deadline: new Date(charge.periodEnd.getTime() + this.requestDays * DAY_MS).toISOString(),
      source: charge.source,
      requested: charge.refundRequests[0]?.status ?? null,
    };
  }

  /** 환불 요청 — 대상이 아니면 거절. 구글·테스트는 바로 환불, 애플은 안내 주소 */
  async request(userId: string, chargeId: string, now = new Date()): Promise<{ status: RefundRequestStatus; url?: string }> {
    const candidate = (await this.candidates(userId, now)).find((item) => item.chargeId === chargeId);
    if (!candidate) throw new BadRequestException(appError('REFUND_NOT_ELIGIBLE'));
    if (candidate.source === ChargeSource.APPLE) {
      await this.prisma.refundRequest.upsert({
        where: { chargeId_reason: { chargeId, reason: REASON } },
        create: { chargeId, userId, reason: REASON, source: candidate.source, status: RefundRequestStatus.STORE_GUIDED },
        update: {},
      });
      return { status: RefundRequestStatus.STORE_GUIDED, url: APPLE_REFUND_URL };
    }
    // 두 번 눌러도 한 번만 환불 — 요청 기록을 먼저 만들고(고유 제약), 환불이 실패하면 지움
    try {
      await this.prisma.refundRequest.create({ data: { chargeId, userId, reason: REASON, source: candidate.source, status: RefundRequestStatus.REFUNDED } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { status: RefundRequestStatus.REFUNDED };
      throw error;
    }
    try {
      const charge = await this.prisma.purchaseCharge.findUniqueOrThrow({ where: { id: chargeId }, select: { storeTransactionId: true } });
      if (candidate.source === ChargeSource.GOOGLE) {
        if (!charge.storeTransactionId) throw new BadRequestException(appError('REFUND_FAILED'));
        await this.iap.refundGoogleOrder(charge.storeTransactionId);
        await this.ledger.markRefunded(this.prisma, charge.storeTransactionId, now);
      } else {
        await this.prisma.purchaseCharge.updateMany({ where: { id: chargeId, refundedAt: null }, data: { refundedAt: now } });
      }
    } catch (error) {
      await this.prisma.refundRequest.deleteMany({ where: { chargeId, reason: REASON } });
      throw error;
    }
    return { status: RefundRequestStatus.REFUNDED };
  }
}
