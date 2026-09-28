import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../notifications/push.service.js';
import { pushStrings } from '../notifications/push-messages.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { MediaService } from '../storage/media.service.js';
import { MessageMediaType, MessageSenderType, ReportStatus, UserStatus } from '../generated/prisma/enums.js';
import { ensureCanViewActor, ensureIsActorSelf } from '../common/authorization/actor-access.js';
import { ensureActiveSubscription } from '../common/authorization/ensure-active-subscription.js';
import { fanTag } from '../common/nickname/nickname.js';
import type { SendReplyDto } from './dto/send-reply.dto.js';
import type { SendBroadcastDto } from './dto/send-broadcast.dto.js';

const NAME_PLACEHOLDER = '{{name}}';
const QUOTE_PREVIEW_LENGTH = 120;

// 스타의 인용 답장이 가리키는 팬 메시지 — 화면에 보여줄 요약만 가져옴(이 채널에서 차단됐는지도 같이)
function quoteInclude(actorId: string) {
  return {
    replyTo: {
      select: {
        id: true,
        senderType: true,
        body: true,
        mediaType: true,
        fanUser: {
          select: {
            nickname: true,
            status: true,
            deletedAt: true,
            blockedInChannels: { where: { actorId }, select: { id: true }, take: 1 },
          },
        },
        reports: { where: { status: ReportStatus.RESOLVED }, select: { id: true }, take: 1 },
      },
    },
  } as const;
}

interface QuotedSource {
  id: string;
  senderType: MessageSenderType;
  body: string | null;
  mediaType: MessageMediaType;
  fanUser: { nickname: string | null; status: UserStatus; deletedAt?: Date | null; blockedInChannels?: { id: string }[] } | null;
  reports: { id: string }[];
}

/**
 * 인용 표시용 요약 — 스타가 팬 메시지를 인용한 경우만(팬 답장이 자동으로 묶인 스타 메시지는 인용이 아니라서
 * 안 보여줌, 버블 방식). 인용된 팬이 정지·차단됐거나 그 메시지가 신고 처리(RESOLVED)됐으면 내용을 가림.
 * 인용 답장은 전체 구독자에게 보이므로 팬은 닉네임으로만(2026-09-28 확정).
 */
export function toQuote(source: QuotedSource | null) {
  if (!source || source.senderType !== MessageSenderType.FAN) return null;
  const hidden =
    !source.fanUser ||
    source.fanUser.status !== UserStatus.ACTIVE ||
    !!source.fanUser.deletedAt ||
    (source.fanUser.blockedInChannels?.length ?? 0) > 0 ||
    source.reports.length > 0;
  return {
    id: source.id,
    hidden,
    nickname: hidden ? null : (source.fanUser?.nickname ?? null),
    body: hidden || !source.body ? null : source.body.slice(0, QUOTE_PREVIEW_LENGTH),
  };
}

// 이 배우 채널에서 차단되지 않은 팬
function notBlockedIn(actorId: string) {
  return { blockedInChannels: { none: { actorId } } };
}

function withQuote<T extends { replyTo: QuotedSource | null }>(message: T) {
  const { replyTo, ...rest } = message;
  return { ...rest, replyTo: toQuote(replyTo) };
}
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
    private readonly config: ConfigService,
  ) {}

  // 스타 메시지 하나당 팬 1명이 보낼 수 있는 답장 수(버블 방식, 잠정 3 — STATUS.md 출시 전 확정 정책). 설정값으로 조정
  private get repliesPerMessage(): number {
    const value = Number(this.config.get<string>('FAN_REPLIES_PER_MESSAGE'));
    return Number.isInteger(value) && value > 0 ? value : 3;
  }

  // 팬이 지금 답장할 대상(구독 이후 가장 최근의, 지워지지 않은 스타 메시지)과 거기에 이미 보낸 답장 수
  private async replyTarget(userId: string, actorId: string, since: Date) {
    const target = await this.prisma.message.findFirst({
      where: { actorId, senderType: MessageSenderType.ARTIST, deletedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const used = target
      ? await this.prisma.message.count({ where: { replyToMessageId: target.id, fanUserId: userId, senderType: MessageSenderType.FAN } })
      : 0;
    return { target, used };
  }

  /** 팬 화면 입력창 위 "남은 답장 N개" */
  async replyQuota(userId: string, actorId: string) {
    const subscription = await ensureActiveSubscription(this.prisma, userId, actorId);
    const { target, used } = await this.replyTarget(userId, actorId, subscription.startedAt);
    const limit = this.repliesPerMessage;
    return { messageId: target?.id ?? null, limit, used, remaining: target ? Math.max(limit - used, 0) : 0 };
  }

  // 팬 본인의 대화방: 구독 시작일 이후의 방송 메시지 + 본인이 보낸 답장만, 시간순
  async listForFan(userId: string, actorId: string) {
    const subscription = await ensureActiveSubscription(this.prisma, userId, actorId);
    const messages = await this.prisma.message.findMany({
      where: {
        actorId,
        createdAt: { gte: subscription.startedAt },
        // 스타가 지웠거나 운영자가 가린 메시지는 팬에게 안 보임(팬 답장엔 deletedAt이 없음)
        deletedAt: null,
        OR: [{ senderType: MessageSenderType.ARTIST }, { fanUserId: userId }],
      },
      include: quoteInclude(actorId),
      orderBy: { createdAt: 'asc' },
    });

    const fan = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.mediaService.withReadUrls(
      messages.map(withQuote).map((message) => ({
        ...message,
        body:
          message.senderType === MessageSenderType.ARTIST && message.body
            ? personalize(message.body, fan.nickname ?? fan.displayName)
            : message.body,
      })),
    );
  }

  async sendReply(userId: string, actorId: string, dto: SendReplyDto) {
    const subscription = await ensureActiveSubscription(this.prisma, userId, actorId);
    // 채널 차단: 구독·열람은 그대로지만 답장은 못 보냄(잠정 정책 — 차단 사실을 알림, STATUS.md)
    const blocked = await this.prisma.actorFanBlock.findUnique({
      where: { actorId_fanUserId: { actorId, fanUserId: userId } },
      select: { id: true },
    });
    if (blocked) throw new ForbiddenException('이 채널에서는 답장을 보낼 수 없어요.');
    await this.moderationService.assertNoBannedWords(dto.body);
    // 버블 방식: 팬은 대상을 고르지 않고, 지금 팬 화면에 보이는 가장 최근 스타 메시지에 대한 답장이 됨
    // (구독 전·삭제된 메시지는 팬에게 안 보이므로 제외). 스타 화면은 이걸로 메시지별 답장을 묶어 보여줌.
    const { target: latestArtistMessage, used } = await this.replyTarget(userId, actorId, subscription.startedAt);
    // 스타 메시지가 오기 전엔 답장할 곳이 없음 — 예전엔 대상 없이 저장돼서 스타의 "메시지별 답장" 어디에도 안 보였음
    if (!latestArtistMessage) throw new BadRequestException('스타의 첫 메시지가 오면 답장할 수 있어요.');
    if (used >= this.repliesPerMessage) {
      throw new BadRequestException(
        `이 메시지에는 답장을 ${this.repliesPerMessage}개까지 보낼 수 있어요. 스타의 다음 메시지를 기다려 주세요.`,
      );
    }
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          actorId,
          senderType: MessageSenderType.FAN,
          fanUserId: userId,
          body: dto.body,
          replyToMessageId: latestArtistMessage.id,
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
    // 인용 답장: 같은 배우 채널의 팬 메시지만 인용 가능(다른 채널 메시지·스타 메시지 인용 불가)
    if (dto.replyToMessageId) {
      const quoted = await this.prisma.message.findFirst({
        where: { id: dto.replyToMessageId, actorId, senderType: MessageSenderType.FAN },
        select: { id: true },
      });
      if (!quoted) throw new BadRequestException('이 채널의 팬 메시지만 인용할 수 있어요.');
    }
    if (mediaKey) await this.mediaService.verifyForAttach(actorId, 'message', dto.mediaType as Exclude<MessageMediaType, 'TEXT'>, mediaKey);
    const thumbnailKey = dto.mediaType === MessageMediaType.VIDEO && dto.thumbnailKey ? dto.thumbnailKey : null;
    if (thumbnailKey) await this.mediaService.verifyForAttach(actorId, 'message', MessageMediaType.PHOTO, thumbnailKey);

    const created = await this.prisma.message.create({
      data: {
        actorId,
        senderType: MessageSenderType.ARTIST,
        mediaType: dto.mediaType,
        body: dto.body,
        mediaKey,
        thumbnailKey,
        replyToMessageId: dto.replyToMessageId ?? null,
        // 길이는 음성·영상 모두(말풍선에 표시), 음파는 음성만
        ...(dto.mediaType === MessageMediaType.AUDIO || dto.mediaType === MessageMediaType.VIDEO
          ? { mediaDurationMs: dto.durationMs ?? null }
          : {}),
        ...(dto.mediaType === MessageMediaType.AUDIO ? { waveform: dto.waveform ?? undefined } : {}),
      },
      include: quoteInclude(actorId),
    });
    const message = await this.mediaService.withReadUrl(withQuote(created));

    // 알림을 끈 팬은 푸시만 빼고 나머지(메시지 도착·lastArtistMessageAt)는 똑같이
    const activeSubscriptions = await this.prisma.subscription.findMany({
      where: { actorId, cancelledAt: null, notificationsMuted: false },
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
    // 알림을 누르면 앱이 이 값으로 해당 채팅방(팬)/콘솔(소속사)로 이동
    const pushData = { type: 'NEW_MESSAGE', actorId, messageId: message.id };
    const preview = (locale: string | null, fanName?: string) => {
      if (!dto.body) return pushStrings(locale).media[dto.mediaType];
      const text = fanName ? personalize(dto.body, fanName) : dto.body;
      return text.slice(0, PUSH_PREVIEW_LENGTH);
    };
    await this.pushService
      .sendToUsers(
        activeSubscriptions.map((sub) => sub.userId),
        ({ locale, displayName }) => ({ title: actor.chatDisplayName, body: preview(locale, displayName) }),
        pushData,
      )
      .catch(() => {});
    // 소속사 모니터링용 알림 — 팬 알림과 별개, 실패해도 발송 자체엔 영향 없음(모니터링은 원문 그대로라 치환 안 함)
    await this.pushService
      .notifyActorStaff(
        actorId,
        ({ locale }) => ({
          title: pushStrings(locale).staffNewMessageTitle(actor.chatDisplayName),
          body: preview(locale),
        }),
        pushData,
      )
      .catch(() => {});

    return message;
  }

  // 콘솔 "구독자 답장 모아보기" — 스태프/배우 본인/관리자. messageId를 주면 그 스타 메시지에 달린 답장만
  // (스타 화면의 "메시지별 팬 답장")
  async listReplies(requesterId: string, actorId: string, messageId?: string) {
    await ensureCanViewActor(this.prisma, requesterId, actorId);
    const replies = await this.prisma.message.findMany({
      where: {
        actorId,
        senderType: MessageSenderType.FAN,
        fanUser: notBlockedIn(actorId),
        ...(messageId ? { replyToMessageId: messageId } : {}),
      },
      include: { fanUser: { select: { id: true, nickname: true, deletedAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // 스타·소속사에겐 실명일 수 있는 로그인 이름 대신 닉네임 + 같은 닉네임 구분용 태그만. 탈퇴한 팬은 null
    // (앱이 "탈퇴한 팬"으로 표시)
    return replies.map(({ fanUser, ...reply }) => ({
      ...reply,
      fanUser: fanUser && !fanUser.deletedAt ? { id: fanUser.id, nickname: fanUser.nickname, tag: fanTag(fanUser.id) } : null,
    }));
  }

  // 소속사 모니터링 — 배우가 실제로 보낸 메시지를 읽기 전용으로 확인(개인화 치환 없이 원문 그대로)
  async listBroadcasts(requesterId: string, actorId: string) {
    await ensureCanViewActor(this.prisma, requesterId, actorId);
    const messages = await this.prisma.message.findMany({
      where: { actorId, senderType: MessageSenderType.ARTIST },
      orderBy: { createdAt: 'desc' },
      include: {
        ...quoteInclude(actorId),
        // 이 채널에서 차단된 팬의 답장은 세지 않음
        _count: { select: { replies: { where: { senderType: MessageSenderType.FAN, fanUser: notBlockedIn(actorId) } } } },
      },
    });
    return this.mediaService.withReadUrls(
      messages.map(({ _count, ...message }) => ({ ...withQuote(message), replyCount: _count.replies })),
    );
  }

  /**
   * 스타의 보낸 메시지 삭제(보내기 취소) — 팬 화면에서 사라지고, 소속사 모니터링엔 "배우가 삭제한 메시지"로 남음.
   * 이미 보낸 푸시 알림은 되돌릴 수 없음. 첨부 파일은 신고가 걸려 있지 않으면 지움(신고 증거는 남김).
   */
  async deleteBroadcast(requesterId: string, actorId: string, messageId: string) {
    await ensureIsActorSelf(this.prisma, requesterId, actorId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, actorId, senderType: MessageSenderType.ARTIST },
      select: { id: true, deletedAt: true, mediaKey: true, thumbnailKey: true, _count: { select: { reports: true } } },
    });
    if (!message) throw new NotFoundException('메시지를 찾을 수 없어요.');
    if (message.deletedAt) return;
    const keepFile = message._count.reports > 0;
    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), ...(keepFile ? {} : { mediaKey: null, thumbnailKey: null }) },
    });
    if (!keepFile) {
      await this.mediaService.deleteQuietly(message.mediaKey);
      await this.mediaService.deleteQuietly(message.thumbnailKey);
    }
  }
}
