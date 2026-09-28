import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../notifications/push.service.js';
import { pushStrings } from '../notifications/push-messages.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { MediaService } from '../storage/media.service.js';
import { MessageMediaType, MessageSenderType } from '../generated/prisma/enums.js';
import { ensureCanViewActor, ensureIsActorSelf } from '../common/authorization/actor-access.js';
import { ensureActiveSubscription } from '../common/authorization/ensure-active-subscription.js';
import type { SendReplyDto } from './dto/send-reply.dto.js';
import type { SendBroadcastDto } from './dto/send-broadcast.dto.js';

const NAME_PLACEHOLDER = '{{name}}';
const PUSH_PREVIEW_LENGTH = 60;

function personalize(body: string, fanName: string): string {
  return body.replaceAll(NAME_PLACEHOLDER, fanName);
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly moderationService: ModerationService,
    private readonly mediaService: MediaService,
  ) {}

  // 팬 본인의 대화방: 구독 시작일 이후의 방송 메시지 + 본인이 보낸 답장만, 시간순
  async listForFan(userId: string, actorId: string) {
    const subscription = await ensureActiveSubscription(this.prisma, userId, actorId);
    const messages = await this.prisma.message.findMany({
      where: {
        actorId,
        createdAt: { gte: subscription.startedAt },
        OR: [{ senderType: MessageSenderType.ARTIST }, { fanUserId: userId }],
      },
      orderBy: { createdAt: 'asc' },
    });

    const fan = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.mediaService.withReadUrls(
      messages.map((message) => ({
        ...message,
        body:
          message.senderType === MessageSenderType.ARTIST && message.body
            ? personalize(message.body, fan.displayName)
            : message.body,
      })),
    );
  }

  async sendReply(userId: string, actorId: string, dto: SendReplyDto) {
    const subscription = await ensureActiveSubscription(this.prisma, userId, actorId);
    await this.moderationService.assertNoBannedWords(dto.body);
    // 버블 방식: 팬은 대상을 고르지 않고, 지금 팬 화면에 보이는 가장 최근 스타 메시지에 대한 답장이 됨
    // (구독 전 메시지는 팬에게 안 보이므로 제외). 스타 화면은 이걸로 메시지별 답장을 묶어 보여줌.
    const latestArtistMessage = await this.prisma.message.findFirst({
      where: { actorId, senderType: MessageSenderType.ARTIST, createdAt: { gte: subscription.startedAt } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          actorId,
          senderType: MessageSenderType.FAN,
          fanUserId: userId,
          body: dto.body,
          replyToMessageId: latestArtistMessage?.id ?? null,
        },
      }),
      this.prisma.subscription.update({
        where: { userId_actorId: { userId, actorId } },
        data: { lastFanReplyAt: new Date() },
      }),
    ]);
    return message;
  }

  async sendBroadcast(actorSelfUserId: string, actorId: string, dto: SendBroadcastDto) {
    await ensureIsActorSelf(this.prisma, actorSelfUserId, actorId);
    const mediaKey = dto.mediaType === MessageMediaType.TEXT ? null : dto.mediaKey!;
    if (mediaKey) await this.mediaService.verifyForAttach(actorId, 'message', dto.mediaType as Exclude<MessageMediaType, 'TEXT'>, mediaKey);

    const created = await this.prisma.message.create({
      data: {
        actorId,
        senderType: MessageSenderType.ARTIST,
        mediaType: dto.mediaType,
        body: dto.body,
        mediaKey,
        ...(dto.mediaType === MessageMediaType.AUDIO
          ? { mediaDurationMs: dto.durationMs ?? null, waveform: dto.waveform ?? undefined }
          : {}),
      },
    });
    const message = await this.mediaService.withReadUrl(created);

    const activeSubscriptions = await this.prisma.subscription.findMany({
      where: { actorId, cancelledAt: null },
      select: { userId: true },
    });
    await this.prisma.subscription.updateMany({
      where: { actorId, cancelledAt: null },
      data: { lastArtistMessageAt: new Date() },
    });

    // 푸시는 실패해도 메시지 발송 자체는 성공으로 처리 (best-effort). 카톡처럼 제목은 보낸 사람(대화방 이름),
    // 본문은 메시지 미리보기 — {{name}}은 받는 팬 본인 이름으로 치환, 텍스트가 없으면 미디어 종류 안내를
    // 받는 사람 언어로.
    const actor = await this.prisma.actor.findUniqueOrThrow({ where: { id: actorId }, select: { chatDisplayName: true } });
    const preview = (locale: string | null, fanName?: string) => {
      if (!dto.body) return pushStrings(locale).media[dto.mediaType];
      const text = fanName ? personalize(dto.body, fanName) : dto.body;
      return text.slice(0, PUSH_PREVIEW_LENGTH);
    };
    await Promise.all(
      activeSubscriptions.map((sub) =>
        this.pushService
          .sendToUser(sub.userId, ({ locale, displayName }) => ({ title: actor.chatDisplayName, body: preview(locale, displayName) }))
          .catch(() => {}),
      ),
    );
    // 소속사 모니터링용 알림 — 팬 알림과 별개, 실패해도 발송 자체엔 영향 없음(모니터링은 원문 그대로라 치환 안 함)
    await this.pushService
      .notifyActorStaff(actorId, ({ locale }) => ({
        title: pushStrings(locale).staffNewMessageTitle(actor.chatDisplayName),
        body: preview(locale),
      }))
      .catch(() => {});

    return message;
  }

  // 콘솔 "구독자 답장 모아보기" — 스태프/배우 본인/관리자. messageId를 주면 그 스타 메시지에 달린 답장만
  // (스타 화면의 "메시지별 팬 답장")
  async listReplies(requesterId: string, actorId: string, messageId?: string) {
    await ensureCanViewActor(this.prisma, requesterId, actorId);
    return this.prisma.message.findMany({
      where: { actorId, senderType: MessageSenderType.FAN, ...(messageId ? { replyToMessageId: messageId } : {}) },
      include: { fanUser: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 소속사 모니터링 — 배우가 실제로 보낸 메시지를 읽기 전용으로 확인(개인화 치환 없이 원문 그대로)
  async listBroadcasts(requesterId: string, actorId: string) {
    await ensureCanViewActor(this.prisma, requesterId, actorId);
    const messages = await this.prisma.message.findMany({
      where: { actorId, senderType: MessageSenderType.ARTIST },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { replies: { where: { senderType: MessageSenderType.FAN } } } } },
    });
    return this.mediaService.withReadUrls(
      messages.map(({ _count, ...message }) => ({ ...message, replyCount: _count.replies })),
    );
  }
}
