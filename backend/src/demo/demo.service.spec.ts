import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { DemoService } from './demo.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const make = (env: Record<string, string>) => {
  const prisma = { $transaction: vi.fn() };
  const service = new DemoService({ get: (key: string) => env[key] } as unknown as ConfigService, prisma as unknown as PrismaService);
  return { service, prisma };
};

describe('운영자 화면 데모 초기화', () => {
  it('운영 서버나 DEMO_SEED가 없는 서버에선 404, 데이터를 건드리지 않음', async () => {
    const envs: Record<string, string>[] = [{ NODE_ENV: 'production', DEMO_SEED: 'true' }, { NODE_ENV: 'development' }];
    for (const env of envs) {
      const { service, prisma } = make(env);
      expect(service.isEnabled()).toBe(false);
      await expect(service.reset()).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  });

  it('데모 서버에선 한 트랜잭션으로 초기화', async () => {
    const { service, prisma } = make({ NODE_ENV: 'development', DEMO_SEED: 'true' });
    expect(service.isEnabled()).toBe(true);
    await service.reset();
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
