import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEach = vi.fn();
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ sendEach }) }));
vi.mock('firebase-admin/app', () => ({ cert: vi.fn(), getApps: () => [{}], initializeApp: vi.fn() }));

const { PushService, buildPushMessages, chunk } = await import('./push.service.js');
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';

function setup(deviceCount: number) {
  const devices = Array.from({ length: deviceCount }, (_, i) => ({
    token: `t${i}`,
    user: { locale: i % 2 ? 'th' : 'ko', displayName: `fan${i}` },
  }));
  const prisma = {
    pushDevice: { findMany: vi.fn().mockResolvedValue(devices), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const config = { get: () => '{}' } as unknown as ConfigService;
  const service = new PushService(config, prisma as unknown as PrismaService);
  service.onModuleInit();
  return { service, prisma };
}

describe('PushService', () => {
  beforeEach(() => {
    sendEach.mockReset();
  });

  it('기기마다 받는 사람 언어·이름으로 문구를 만든다', () => {
    const messages = buildPushMessages(
      [
        { token: 'a', user: { locale: 'ko', displayName: '민지' } },
        { token: 'b', user: { locale: 'th', displayName: 'Fah' } },
      ],
      ({ locale, displayName }) => ({ title: 'T', body: `${locale}:${displayName}` }),
      { actorId: 'x' },
    );
    expect(messages.map((m) => (m as { notification: { body: string } }).notification.body)).toEqual(['ko:민지', 'th:Fah']);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('1,200개 기기는 500개씩 3번에 나눠 보내고, 죽은 토큰만 지운다', async () => {
    const { service, prisma } = setup(1200);
    sendEach.mockImplementation((batch: unknown[]) =>
      Promise.resolve({
        failureCount: 1,
        responses: batch.map((_, i) =>
          i === 0 ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true },
        ),
      }),
    );
    await service.sendToUsers(['u1'], () => ({ title: 't', body: 'b' }));
    expect(sendEach.mock.calls.map((call) => (call[0] as unknown[]).length)).toEqual([500, 500, 200]);
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['t0', 't500', 't1000'] } } });
  });

  it('발송 자체가 실패해도 예외를 던지지 않는다(best-effort)', async () => {
    const { service } = setup(3);
    sendEach.mockRejectedValue(new Error('network'));
    await expect(service.sendToUsers(['u1'], () => ({ title: 't', body: 'b' }))).resolves.toBeUndefined();
  });
});
