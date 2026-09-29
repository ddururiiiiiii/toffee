import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { MessageSenderType, Role, UserStatus } from '../generated/prisma/enums.js';
import { PushService } from './push.service.js';
import { pushStrings } from './push-messages.js';
import { DEFAULT_IDLE_RULE, idleStage, refundWarningLeft, type IdleReminderRule } from './idle-reminder.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 스타 장기 미발송 알림(2026-09-29, 사용자 제안: 배우 본인에게도 푸시). 구독 팬이 있는 방에서 마지막 스타 메시지 후
 * - 3일: 배우(커플방이면 두 배우)에게 "팬 N명이 기다리고 있어요"
 * - 7일: 배우에게 다시 + 소속사 직원에게, 이후 7일마다 한 번
 * - 환불 기준(30일) 3일 전·하루 전: 배우 + 소속사 + 운영자에게 "며칠 뒤면 팬이 환불을 요청할 수 있어요"(2026-09-29 — 버블 방식 환불 정책)
 * 매일 태국 낮 12시 5분에 확인(밤에 안 울리게). 같은 단계는 한 번만 — 서버가 여러 대여도 먼저 기록한 쪽만 보냄. 활동 종료한 방은 제외.
 */
@Injectable()
export class IdleReminderService {
  private readonly logger = new Logger(IdleReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  private get rule(): IdleReminderRule {
    const num = (key: string, fallback: number) => {
      const value = Number(this.config.get<string>(key));
      return Number.isInteger(value) && value > 0 ? value : fallback;
    };
    return {
      firstDays: num('IDLE_REMINDER_DAYS', DEFAULT_IDLE_RULE.firstDays),
      escalateDays: num('IDLE_ESCALATE_DAYS', DEFAULT_IDLE_RULE.escalateDays),
      repeatDays: num('IDLE_REPEAT_DAYS', DEFAULT_IDLE_RULE.repeatDays),
      refundDays: num('IDLE_REFUND_DAYS', DEFAULT_IDLE_RULE.refundDays),
    };
  }

  @Cron('5 12 * * *', { timeZone: 'Asia/Bangkok' })
  async scheduled() {
    if (this.config.get<string>('IDLE_REMINDER_ENABLED') === 'false') return;
    const sent = await this.run().catch((error: unknown) => {
      this.logger.error(`미발송 알림 실패: ${String(error)}`);
      return 0;
    });
    if (sent > 0) this.logger.log(`미발송 알림 ${sent}개 방`);
  }

  /** 알림을 보낸 방 수 */
  async run(now = new Date()): Promise<number> {
    const rule = this.rule;
    const rooms = await this.prisma.actor.findMany({
      where: {
        retiredAt: null,
        coupleMembers: { none: { member: { retiredAt: { not: null } } } },
        subscriptions: { some: { cancelledAt: null } },
      },
      select: {
        id: true,
        kind: true,
        chatDisplayName: true,
        createdAt: true,
        selfUserId: true,
        idleReminderStage: true,
        idleReminderFor: true,
        coupleMembers: { select: { member: { select: { selfUserId: true } } } },
        _count: { select: { subscriptions: { where: { cancelledAt: null } } } },
      },
    });
    if (rooms.length === 0) return 0;
    const last = await this.prisma.message.groupBy({
      by: ['actorId'],
      where: { actorId: { in: rooms.map((room) => room.id) }, senderType: MessageSenderType.ARTIST, deletedAt: null },
      _max: { createdAt: true },
    });
    const lastByRoom = new Map(last.map((row) => [row.actorId, row._max.createdAt]));

    let sent = 0;
    for (const room of rooms) {
      // 아직 한 번도 안 보낸 방은 방이 만들어진 때부터 셈
      const since = lastByRoom.get(room.id) ?? room.createdAt;
      const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
      const stage = idleStage(days, rule);
      if (stage === 0) continue;
      if (room.idleReminderFor?.getTime() === since.getTime() && (room.idleReminderStage ?? 0) >= stage) continue;
      // 먼저 기록한 서버만 보냄(여러 대가 동시에 돌아도 한 번)
      const { count } = await this.prisma.actor.updateMany({
        where: {
          id: room.id,
          OR: [{ idleReminderFor: null }, { idleReminderFor: { not: since } }, { idleReminderStage: null }, { idleReminderStage: { lt: stage } }],
        },
        data: { idleReminderStage: stage, idleReminderFor: since },
      });
      if (count === 0) continue;

      const fans = room._count.subscriptions;
      const roomName = room.kind === 'COUPLE' ? room.chatDisplayName : undefined;
      const selfUserIds = [room.selfUserId, ...room.coupleMembers.map(({ member }) => member.selfUserId)].filter((id): id is string => !!id);
      const data = { type: 'idle-reminder', actorId: room.id };
      const left = refundWarningLeft(stage, rule);
      if (left !== null) {
        // 환불 기준 경고 — 배우·소속사·운영자 모두(운영자가 소속사에 직접 연락할 수 있게)
        const admins = await this.prisma.user.findMany({ where: { role: Role.ADMIN, status: UserStatus.ACTIVE }, select: { id: true } });
        const warn = (locale: string | null | undefined) => {
          const t = pushStrings(locale);
          return { title: t.idleRefundTitle(room.chatDisplayName, left), body: t.idleRefundBody(days, fans) };
        };
        await this.push.sendToUsers(selfUserIds, (recipient) => warn(recipient.locale), data);
        await this.push.notifyActorStaff(room.id, (recipient) => warn(recipient.locale), data);
        await this.push.sendToUsers(
          admins.map((admin) => admin.id),
          (recipient) => warn(recipient.locale),
          data,
        );
        sent += 1;
        continue;
      }
      await this.push.sendToUsers(
        selfUserIds,
        (recipient) => {
          const t = pushStrings(recipient.locale);
          return { title: t.idleActorTitle(fans), body: t.idleActorBody(days, roomName) };
        },
        data,
      );
      if (stage >= rule.escalateDays) {
        await this.push.notifyActorStaff(
          room.id,
          (recipient) => {
            const t = pushStrings(recipient.locale);
            return { title: t.idleStaffTitle(room.chatDisplayName, days), body: t.idleStaffBody(fans) };
          },
          data,
        );
      }
      sent += 1;
    }
    return sent;
  }
}
