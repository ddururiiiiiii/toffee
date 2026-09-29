import { describe, expect, it } from 'vitest';
import { idleStage, refundWarningLeft } from './idle-reminder.js';
import { IdleReminderService } from './idle-reminder.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PushService, ComposePush } from './push.service.js';
import type { ConfigService } from '@nestjs/config';

const DAY = 24 * 60 * 60 * 1000;

describe('미발송 단계', () => {
  it('3일 → 3, 7~13일 → 7, 14일 → 14, 그 전엔 0', () => {
    expect([0, 2, 3, 6, 7, 13, 14, 20, 21].map((days) => idleStage(days))).toEqual([0, 0, 3, 3, 7, 7, 14, 14, 21]);
  });

  it('환불 기준(30일) 3일 전·하루 전엔 경고 단계, 28일 반복 알림은 건너뜀', () => {
    expect([26, 27, 28, 29, 30, 34, 35].map((days) => idleStage(days))).toEqual([21, 27, 27, 29, 28, 28, 35]);
    expect([27, 29, 21, 28].map((stage) => refundWarningLeft(stage))).toEqual([3, 1, null, null]);
  });
});

function setup(rooms: Record<string, unknown>[], lastMessage: Record<string, Date>) {
  const sent: { to: string[]; title: string; body: string }[] = [];
  const staff: { roomId: string; title: string }[] = [];
  const db = {
    actor: {
      findMany: async () => rooms,
      updateMany: async ({ where, data }: { where: { id: string }; data: { idleReminderStage: number; idleReminderFor: Date } }) => {
        const room = rooms.find((r) => r.id === where.id)!;
        const same = (room.idleReminderFor as Date | null)?.getTime() === data.idleReminderFor.getTime();
        if (same && ((room.idleReminderStage as number | null) ?? 0) >= data.idleReminderStage) return { count: 0 };
        Object.assign(room, data);
        return { count: 1 };
      },
    },
    message: { groupBy: async () => Object.entries(lastMessage).map(([actorId, createdAt]) => ({ actorId, _max: { createdAt } })) },
    user: { findMany: async () => [{ id: 'admin-1' }] },
  };
  const push = {
    sendToUsers: async (to: string[], compose: ComposePush) => {
      sent.push({ to, ...compose({ locale: 'ko', displayName: '' }) });
    },
    notifyActorStaff: async (roomId: string, compose: ComposePush) => {
      staff.push({ roomId, title: compose({ locale: 'ko', displayName: '' }).title });
    },
  };
  const service = new IdleReminderService(db as unknown as PrismaService, push as unknown as PushService, { get: () => undefined } as unknown as ConfigService);
  return { service, sent, staff, rooms };
}

const room = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'SOLO',
  chatDisplayName: id,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  selfUserId: `self-${id}`,
  idleReminderStage: null,
  idleReminderFor: null,
  coupleMembers: [],
  _count: { subscriptions: 42 },
  ...extra,
});

describe('미발송 알림 보내기', () => {
  const now = new Date('2026-09-29T05:05:00Z');

  it('3일째엔 배우에게만, 같은 단계는 다음 날 다시 안 보냄', async () => {
    const t = setup([room('a1')], { a1: new Date(now.getTime() - 3 * DAY - 1000) });
    expect(await t.service.run(now)).toBe(1);
    expect(t.sent).toEqual([{ to: ['self-a1'], title: '팬 42명이 기다리고 있어요', body: '마지막 메시지가 3일 전이에요. 짧은 인사라도 남겨 볼까요?' }]);
    expect(t.staff).toEqual([]);
    expect(await t.service.run(new Date(now.getTime() + DAY))).toBe(0);
  });

  it('7일째엔 배우 + 소속사, 커플방은 두 배우에게 방 이름과 함께', async () => {
    const couple = room('ab', {
      kind: 'COUPLE',
      chatDisplayName: '캐러멜 & 누가',
      selfUserId: null,
      coupleMembers: [{ member: { selfUserId: 'self-a' } }, { member: { selfUserId: 'self-b' } }],
    });
    const t = setup([couple], { ab: new Date(now.getTime() - 7 * DAY - 1000) });
    await t.service.run(now);
    expect(t.sent[0].to).toEqual(['self-a', 'self-b']);
    expect(t.sent[0].body).toContain('캐러멜 & 누가 · ');
    expect(t.staff).toEqual([{ roomId: 'ab', title: '캐러멜 & 누가님이 7일째 메시지를 보내지 않았어요' }]);
  });

  it('새 메시지를 보내면 처음부터 다시 셈, 아직 3일 안 됐으면 안 보냄', async () => {
    const t = setup([room('a1', { idleReminderStage: 7, idleReminderFor: new Date(now.getTime() - 10 * DAY) })], {
      a1: new Date(now.getTime() - 1 * DAY),
    });
    expect(await t.service.run(now)).toBe(0);
    expect(t.sent).toEqual([]);
  });

  it('27일째(환불 기준 3일 전)엔 배우·소속사·운영자에게 경고, 28일엔 다시 안 보내고 29일에 한 번 더', async () => {
    const t = setup([room('a1', { idleReminderStage: 21, idleReminderFor: new Date(now.getTime() - 27 * DAY - 1000) })], {
      a1: new Date(now.getTime() - 27 * DAY - 1000),
    });
    expect(await t.service.run(now)).toBe(1);
    expect(t.sent.map((push) => push.to)).toEqual([['self-a1'], ['admin-1']]);
    expect(t.sent[0].title).toBe('a1 · 3일 뒤부터 팬이 환불을 요청할 수 있어요');
    expect(t.staff).toEqual([{ roomId: 'a1', title: 'a1 · 3일 뒤부터 팬이 환불을 요청할 수 있어요' }]);
    expect(await t.service.run(new Date(now.getTime() + DAY))).toBe(0);
    expect(await t.service.run(new Date(now.getTime() + 2 * DAY))).toBe(1);
    expect(t.sent.at(-1)?.title).toBe('a1 · 내일부터 팬이 환불을 요청할 수 있어요');
  });
});
