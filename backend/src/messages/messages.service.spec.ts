import { describe, expect, it, vi } from 'vitest';
import { MessagesService, toQuote } from './messages.service.js';
import { MessageMediaType, MessageSenderType, Role, UserStatus } from '../generated/prisma/enums.js';
import type { ComposePush } from '../notifications/push.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PushService } from '../notifications/push.service.js';
import type { ModerationService } from '../moderation/moderation.service.js';
import type { MediaService } from '../storage/media.service.js';
import type { ConfigService } from '@nestjs/config';
import type { RealtimeService } from '../realtime/realtime.service.js';

const realtime = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as RealtimeService;

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
    actor: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ chatDisplayName: '캐러멜', kind: 'SOLO' }),
      // 보낸 사람 확인(1인 방, 운영자 계정) · 보낸 배우 이름 조회
      findUnique: vi.fn().mockResolvedValue({ kind: 'SOLO', selfUserId: 'star', coupleMembers: [] }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
  const push = {
    sendToUser: vi.fn().mockResolvedValue(undefined),
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
    resolveImageUrl: vi.fn((value: string | null) => Promise.resolve(value)),
  } as unknown as MediaService;
  const service = new MessagesService(prisma, push, {} as ModerationService, media, config(), realtime);
  return { service, fanPushes, staffPushes, prisma, push };
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

  it('CP방: 보낸 아티스트가 기록되고, 팬 알림은 "방 이름" 제목 + "보낸 아티스트: 내용"', async () => {
    const { service, fanPushes, prisma } = setup();
    const actor = (prisma as unknown as { actor: Record<string, ReturnType<typeof vi.fn>> }).actor;
    (prisma as unknown as { user: { findUniqueOrThrow: ReturnType<typeof vi.fn> } }).user.findUniqueOrThrow.mockResolvedValue({ role: Role.ACTOR });
    actor.findUnique.mockResolvedValue({
      kind: 'COUPLE',
      selfUserId: null,
      coupleMembers: [{ member: { id: 'nawin', selfUserId: 'u-nawin' } }, { member: { id: 'pakin', selfUserId: 'u-pakin' } }],
    });
    actor.findUniqueOrThrow.mockResolvedValue({ chatDisplayName: 'Nawin & Pakin', kind: 'COUPLE' });
    actor.findMany.mockResolvedValue([{ id: 'pakin', chatDisplayName: 'Pakin', chatProfileImageUrl: null }]);
    (prisma as unknown as { message: { create: ReturnType<typeof vi.fn> } }).message.create.mockResolvedValue({
      id: 'm1',
      mediaKey: null,
      mediaUrl: null,
      senderActorId: 'pakin',
    });

    await service.sendBroadcast('u-pakin', 'couple-1', { mediaType: MessageMediaType.TEXT, body: '같이 인사해요' });

    expect((prisma as unknown as { message: { create: ReturnType<typeof vi.fn> } }).message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderActorId: 'pakin' }) }),
    );
    expect(fanPushes[0]({ locale: 'ko', displayName: '민지' })).toEqual({ title: 'Nawin & Pakin', body: 'Pakin: 같이 인사해요' });
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

describe('MessagesService.sendBroadcast 인용 답장 알림', () => {
  // 인용된 팬 메시지(fan-1 작성) — hidden이면 가려진 인용
  const quoted = (overrides: { status?: UserStatus; blocked?: boolean } = {}) => ({
    id: 'fan-msg',
    senderType: MessageSenderType.FAN,
    body: '오빠 사랑해요',
    mediaType: MessageMediaType.TEXT,
    fanUserId: 'fan-1',
    fanUser: {
      nickname: '민지',
      status: overrides.status ?? UserStatus.ACTIVE,
      deletedAt: null,
      blockedInChannels: overrides.blocked ? [{ id: 'b1' }] : [],
    },
    reports: [],
  });

  function setupQuote(replyTo: ReturnType<typeof quoted>, subscribers = ['fan-1', 'fan-2']) {
    const ctx = setup();
    const prisma = ctx.prisma as unknown as {
      message: { create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
      subscription: { findMany: ReturnType<typeof vi.fn> };
    };
    prisma.message.create.mockResolvedValue({ id: 'm1', mediaKey: null, mediaUrl: null, replyTo });
    prisma.message.findFirst = vi.fn().mockResolvedValue({ id: 'fan-msg' });
    prisma.subscription.findMany.mockResolvedValue(subscribers.map((userId) => ({ userId })));
    return ctx;
  }

  it('인용된 팬은 일반 알림 대신 "내 메시지에 답장했어요" 한 건만', async () => {
    const { service, push } = setupQuote(quoted());
    await service.sendBroadcast('admin', 'actor-1', { mediaType: MessageMediaType.TEXT, body: '고마워', replyToMessageId: 'fan-msg' });

    expect(push.sendToUsers).toHaveBeenCalledWith(['fan-2'], expect.any(Function), expect.anything());
    expect(push.sendToUser).toHaveBeenCalledWith(
      'fan-1',
      expect.any(Function),
      expect.objectContaining({ type: 'QUOTED_REPLY', actorId: 'actor-1', messageId: 'm1' }),
    );
    const compose = vi.mocked(push.sendToUser).mock.calls[0][1];
    expect(compose({ locale: 'ko', displayName: '민지' })).toEqual({ title: '캐러멜님이 내 메시지에 답장했어요', body: '고마워' });
  });

  it('알림을 끈(구독자 목록에 없는) 팬에겐 인용 알림도 안 감', async () => {
    const { service, push } = setupQuote(quoted(), ['fan-2']);
    await service.sendBroadcast('admin', 'actor-1', { mediaType: MessageMediaType.TEXT, body: '고마워', replyToMessageId: 'fan-msg' });
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(push.sendToUsers).toHaveBeenCalledWith(['fan-2'], expect.any(Function), expect.anything());
  });

  it('정지·차단돼서 인용이 가려진 팬에겐 따로 알리지 않음', async () => {
    for (const replyTo of [quoted({ status: UserStatus.SUSPENDED }), quoted({ blocked: true })]) {
      const { service, push } = setupQuote(replyTo);
      await service.sendBroadcast('admin', 'actor-1', { mediaType: MessageMediaType.TEXT, body: '고마워', replyToMessageId: 'fan-msg' });
      expect(push.sendToUser).not.toHaveBeenCalled();
    }
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

  it('아티스트 메시지(팬 답장이 자동으로 묶인 경우)는 인용이 아님', () => {
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
  const service = new MessagesService(prisma, {} as PushService, moderation, {} as MediaService, config(settings), realtime);
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

  it('지워진 아티스트 메시지는 답장 대상에서 빠짐', async () => {
    const { service, prisma } = replySetup(0);
    await service.replyQuota('fan', 'actor');
    expect(prisma.message.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }));
  });
});


describe('MessagesService.listBroadcasts 팬 답장 흐름 미리보기', () => {
  const broadcast = (id: string, replies: number, deletedAt: Date | null = null) => ({
    id,
    mediaKey: null,
    mediaUrl: null,
    deletedAt,
    replyTo: null,
    _count: { replies },
  });

  function previewSetup(broadcasts: ReturnType<typeof broadcast>[]) {
    const findMany = vi.fn((args: { where: { senderType: string; replyToMessageId?: string } }) =>
      args.where.senderType === 'ARTIST'
        ? Promise.resolve(broadcasts)
        : // 최신 순으로 옴
          Promise.resolve([
            { id: `${args.where.replyToMessageId}-r2`, body: '두 번째', createdAt: new Date(2), fanUser: { nickname: '민지' } },
            { id: `${args.where.replyToMessageId}-r1`, body: '첫 번째', createdAt: new Date(1), fanUser: null },
          ]),
    );
    const prisma = {
      user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ role: Role.ADMIN }) },
      message: { findMany },
    } as unknown as PrismaService;
    const media = { withReadUrls: vi.fn((items: object[]) => Promise.resolve(items)) } as unknown as MediaService;
    const service = new MessagesService(prisma, {} as PushService, {} as ModerationService, media, config(), realtime);
    return { service, findMany };
  }

  it('답장이 있는 메시지에 최근 답장을 오래된 것 → 최신 순으로 붙임', async () => {
    const { service, findMany } = previewSetup([broadcast('m1', 2), broadcast('m2', 0), broadcast('m3', 5, new Date())]);
    const result = (await service.listBroadcasts('admin', 'actor-1')) as unknown as {
      id: string;
      recentReplies?: { id: string; nickname: string | null; body: string }[];
    }[];

    expect(result[0].recentReplies?.map((r) => r.body)).toEqual(['첫 번째', '두 번째']);
    expect(result[0].recentReplies?.[1]).toMatchObject({ nickname: '민지' });
    // 답장 없는 최근 메시지는 빈 줄(조회는 안 함), 삭제한 메시지는 줄 자체가 없음
    expect(result[1].recentReplies).toEqual([]);
    expect(result[2].recentReplies).toBeUndefined();
    expect(findMany).toHaveBeenCalledTimes(2);
    // 정지·탈퇴·차단·신고 처리된 답장 제외 조건
    expect(findMany.mock.calls[1][0]).toMatchObject({
      where: { fanUser: { status: 'ACTIVE', deletedAt: null }, reports: { none: { status: 'RESOLVED' } } },
      take: 20,
    });
  });

  it('최근 메시지 10개까지만 미리보기', async () => {
    const { service, findMany } = previewSetup(Array.from({ length: 15 }, (_, i) => broadcast(`m${i}`, 1)));
    const result = (await service.listBroadcasts('admin', 'actor-1')) as unknown as { recentReplies?: unknown[] }[];
    expect(findMany).toHaveBeenCalledTimes(11);
    expect(result[9].recentReplies).toBeDefined();
    expect(result[10].recentReplies).toBeUndefined();
  });
});

describe('MessagesService.listReplies 나눠 받기', () => {
  function listSetup() {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ role: Role.ADMIN }) },
      message: { findMany },
    } as unknown as PrismaService;
    const service = new MessagesService(prisma, {} as PushService, {} as ModerationService, {} as MediaService, config(), realtime);
    return { service, findMany };
  }

  it('limit·before를 주면 그 답장 이전 N개(같은 시각은 id로 순서 고정)', async () => {
    const { service, findMany } = listSetup();
    await service.listReplies('admin', 'actor-1', 'm1', { limit: 100, before: 'r50' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100, cursor: { id: 'r50' }, skip: 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    );
  });

  it('안 주면 전부(콘솔 기존 동작)', async () => {
    const { service, findMany } = listSetup();
    await service.listReplies('admin', 'actor-1');
    const args = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(args.take).toBeUndefined();
    expect(args.cursor).toBeUndefined();
  });
});
