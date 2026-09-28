import { describe, expect, it, vi } from 'vitest';
import { MessagesService } from './messages.service.js';
import { MessageMediaType, Role } from '../generated/prisma/enums.js';
import type { ComposePush } from '../notifications/push.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PushService } from '../notifications/push.service.js';
import type { ModerationService } from '../moderation/moderation.service.js';
import type { MediaService } from '../storage/media.service.js';

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
  const service = new MessagesService(prisma, push, {} as ModerationService, media);
  return { service, fanPushes, staffPushes };
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

  it('본문 없는 미디어는 받는 사람 언어의 안내 문구로', async () => {
    const { service, fanPushes } = setup();
    await service.sendBroadcast('admin', 'actor-1', { mediaType: MessageMediaType.PHOTO, mediaKey: 'actors/actor-1/message/a.jpg' });

    expect(fanPushes[0]({ locale: 'th', displayName: 'fan' }).body).toBe('ส่งรูปภาพ');
    expect(fanPushes[0]({ locale: null, displayName: 'fan' }).body).toBe('Sent a photo');
  });
});
