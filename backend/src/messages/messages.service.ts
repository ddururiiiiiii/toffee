import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../notifications/push.service.js';
import { MessageSenderType } from '../generated/prisma/enums.js';
import { ensureStaffOfActor } from '../common/authorization/ensure-staff-of-actor.js';
import type { SendReplyDto } from './dto/send-reply.dto.js';
import type { SendBroadcastDto } from './dto/send-broadcast.dto.js';

const NAME_PLACEHOLDER = '{{name}}';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  // 팬 본인의 대화방: 구독 시작일 이후의 방송 메시지 + 본인이 보낸 답장만, 시간순
  async listForFan(userId: string, actorId: string) {
    const subscription = await this.getActiveSubscriptionOrThrow(userId, actorId);
    const messages = await this.prisma.message.findMany({
      where: {
        actorId,
        createdAt: { gte: subscription.startedAt },
        OR: [{ senderType: MessageSenderType.ARTIST }, { fanUserId: userId }],
      },
      orderBy: { createdAt: 'asc' },
    });

    const fan = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return messages.map((message) => ({
      ...message,
      body:
        message.senderType === MessageSenderType.ARTIST && message.body
          ? message.body.replaceAll(NAME_PLACEHOLDER, fan.displayName)
          : message.body,
    }));
  }

  async sendReply(userId: string, actorId: string, dto: SendReplyDto) {
    await this.getActiveSubscriptionOrThrow(userId, actorId);
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { actorId, senderType: MessageSenderType.FAN, fanUserId: userId, body: dto.body },
      }),
      this.prisma.subscription.update({
        where: { userId_actorId: { userId, actorId } },
        data: { lastFanReplyAt: new Date() },
      }),
    ]);
    return message;
  }

  async sendBroadcast(staffUserId: string, actorId: string, dto: SendBroadcastDto) {
    await ensureStaffOfActor(this.prisma, staffUserId, actorId);

    const message = await this.prisma.message.create({
      data: { actorId, senderType: MessageSenderType.ARTIST, mediaType: dto.mediaType, body: dto.body, mediaUrl: dto.mediaUrl },
    });

    const activeSubscriptions = await this.prisma.subscription.findMany({
      where: { actorId, cancelledAt: null },
      select: { userId: true },
    });
    await this.prisma.subscription.updateMany({
      where: { actorId, cancelledAt: null },
      data: { lastArtistMessageAt: new Date() },
    });

    // 푸시는 실패해도 메시지 발송 자체는 성공으로 처리 (best-effort)
    await Promise.all(
      activeSubscriptions.map((sub) =>
        this.pushService
          .sendToUser(sub.userId, '새 메시지가 도착했어요', dto.body?.slice(0, 60) ?? '새로운 콘텐츠를 확인해보세요')
          .catch(() => {}),
      ),
    );

    return message;
  }

  // 콘솔 "구독자 답장 모아보기" — 스태프/관리자만
  async listReplies(requesterId: string, actorId: string) {
    await ensureStaffOfActor(this.prisma, requesterId, actorId);
    return this.prisma.message.findMany({
      where: { actorId, senderType: MessageSenderType.FAN },
      include: { fanUser: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getActiveSubscriptionOrThrow(userId: string, actorId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId_actorId: { userId, actorId } },
    });
    if (!subscription || subscription.cancelledAt) {
      throw new ForbiddenException('이 아티스트를 구독해야 대화를 볼 수 있어요.');
    }
    return subscription;
  }
}
