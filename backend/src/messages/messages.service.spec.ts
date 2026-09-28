import { describe, expect, it, vi } from 'vitest';
import { MessagesService, toQuote } from './messages.service.js';
import { MessageMediaType, Role } from '../generated/prisma/enums.js';
import type { ComposePush } from '../notifications/push.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PushService } from '../notifications/push.service.js';
import type { ModerationService } from '../moderation/moderation.service.js';
import type { MediaService } from '../storage/media.service.js';
import type { ConfigService } from '@nestjs/config';

const config = (values: Record<string, string> = {}) => ({ get: (key: string) => values[key] }) as unknown as ConfigService;

// sendBroadcast의 푸시 문구 조립만 검증 — DB/FCM은 가짜로 대체
function setup() {
  const fanPushes: ComposePush[] = [];
  const staffPushes: ComposePush[] = [];
  const prisma = {
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ role: Role.ADMIN }) },
    message: { create: vi.fn().mockResolvedValue({ id: 'm1', mediaKey: null, mediaUrl: null }) },
    subscription: {
      findMany: vi.fn().mockResolvedValue([{ userId: 'fan-1' }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    actor: { findUniqueOrThrow: vi.fn().mockResolvedValue({ chatDisplayName: '캐러멜' }) },
  } as unknown as PrismaService;
  const push = {
    sendToUsers: vi.fn((_userIds: string[], compose: ComposePush) => {
      fanPushes.push(compose);
      return Promise.resolve();
    }),
    notifyActorStaff: vi.fn((_actorId: string, compose: ComposePush) => {
      staffPushes.push(compose);
      return Promise.resolve();
    }),
  } as unknown as PushService;
  const media = {
    verifyForAttach: vi.fn().mockResolvedValue(undefined),
    withReadUrl: vi.fn((item: object) => Promise.resolve(item)),
  } as unknown as MediaService;
  const service = new MessagesService(prisma, push, {} as ModerationService, media, config());
  return { service, fanPushes, staffPushes, prisma };
}

describe('MessagesService.sendBroadcast 푸시 문구', () => {
  it('팬 푸시: 제목은 대화방 이름, {{name}}은 받는 팬 이름으로 치환', async () => {
    const { service, fanPushes, staffPushes } = setup();
    await service.sendBroadcast('admin', 'actor-1', { mediaType: MessageMediaType.TEXT, body: '{{name}}야 안녕!' });

    expect(fanPushes[0]({ locale: 'ko', displayName: '민지' })).toEqual({ title: '캐러멜', body: '민지야 안녕!' });
    // 모니터링용 스태프 알림은 원문 그대로, 제목은 스태프 언어로
    expect(staffPushes[0]({ locale: 'en', displayName: 'staff' })).toEqual({
      title: '캐러멜 sent a new message',
      body: '{{name}}야 안녕!',
    });
  });

  it('알림을 끈 팬(notificationsMuted)은 푸시 대상에서 빠짐', async () => {
    const { service, prisma } = setup();
    await service.sendBroadcast('admin', 'actor-1', { mediaType: MessageMediaType.TEXT, body: '안녕' });
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ notificationsMuted: false, cancelledAt: null }) }),
    );
  });

  it('본문 없는 미디어는 받는 사람 언어의 안내 문구로', async () => {
    const { service, fanPushes } = setup();
    await service.sendBroadcast('admin', 'actor-1', { mediaType: MessageMediaType.PHOTO, mediaKey: 'actors/actor-1/message/a.jpg' });

    expect(fanPushes[0]({ locale: 'th', displayName: 'fan' }).body).toBe('ส่งรูปภาพ');
    expect(fanPushes[0]({ locale: null, displayName: 'fan' }).body).toBe('Sent a photo');
  });
});

describe('인용 답장 요약(toQuote)', () => {
  const base = {
    id: 'q1',
    senderType: 'FAN' as const,
    body: '오늘도 화이팅!',
    mediaType: 'TEXT' as const,
    fanUser: { nickname: '캐러멜바라기', status: 'ACTIVE' as const },
    reports: [],
  };

  it('팬 메시지는 닉네임 + 본문 앞부분', () => {
    expect(toQuote(base)).toEqual({ id: 'q1', hidden: false, nickname: '캐러멜바라기', body: '오늘도 화이팅!' });
    expect(toQuote({ ...base, body: 'a'.repeat(300) })?.body).toHaveLength(120);
  });

  it('정지·차단된 팬이거나 신고 처리된 메시지면 내용과 닉네임을 가림', () => {
    const hidden = { id: 'q1', hidden: true, nickname: null, body: null };
    expect(toQuote({ ...base, fanUser: { nickname: 'x', status: 'BANNED' } })).toEqual(hidden);
    expect(toQuote({ ...base, fanUser: { nickname: 'x', status: 'SUSPENDED' } })).toEqual(hidden);
    expect(toQuote({ ...base, reports: [{ id: 'r1' }] })).toEqual(hidden);
  });

  it('스타 메시지(팬 답장이 자동으로 묶인 경우)는 인용이 아님', () => {
    expect(toQuote({ ...base, senderType: 'ARTIST', fanUser: null })).toBeNull();
    expect(toQuote(null)).toBeNull();
  });
});

// 팬 답장 횟수 제한 — 스타 메시지 하나당 N개(기본 3, FAN_REPLIES_PER_MESSAGE)
function replySetup(alreadySent: number, settings: Record<string, string> = {}) {
  const created = vi.fn().mockResolvedValue({ id: 'r1' });
  const prisma = {
    subscription: {
      findUnique: vi.fn().mockResolvedValue({ startedAt: new Date(0), cancelledAt: null }),
      update: vi.fn().mockResolvedValue({}),
    },
    actorFanBlock: { findUnique: vi.fn().mockResolvedValue(null) },
    message: {
      findFirst: vi.fn().mockResolvedValue({ id: 'star-1' }),
      count: vi.fn().mockResolvedValue(alreadySent),
      create: created,
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  const moderation = { assertNoBannedWords: vi.fn().mockResolvedValue(undefined) } as unknown as ModerationService;
  const service = new MessagesService(prisma, {} as PushService, moderation, {} as MediaService, config(settings));
  return { service, created, prisma };
}

describe('MessagesService 답장 횟수 제한', () => {
  it('3개 미만이면 보내지고, 3개째까지 허용', async () => {
    const { service, created } = replySetup(2);
    await service.sendReply('fan', 'actor', { body: '안녕' });
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ replyToMessageId: 'star-1' }) }));
  });

  it('이미 3개 보냈으면 거절', async () => {
    const { service, created } = replySetup(3);
    await expect(service.sendReply('fan', 'actor', { body: '안녕' })).rejects.toThrow('3개까지');
    expect(created).not.toHaveBeenCalled();
  });

  it('설정값으로 바꿀 수 있고, 남은 개수를 알려줌', async () => {
    const { service } = replySetup(4, { FAN_REPLIES_PER_MESSAGE: '5' });
    await expect(service.replyQuota('fan', 'actor')).resolves.toEqual({ messageId: 'star-1', limit: 5, used: 4, remaining: 1 });
  });

  it('지워진 스타 메시지는 답장 대상에서 빠짐', async () => {
    const { service, prisma } = replySetup(0);
    await service.replyQuota('fan', 'actor');
    expect(prisma.message.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }));
  });
});

