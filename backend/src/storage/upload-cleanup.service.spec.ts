import { describe, expect, it, vi } from 'vitest';
import { UploadCleanupService } from './upload-cleanup.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from './storage.service.js';

const NOW = new Date('2026-09-28T00:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

function setup(objects: { key: string; lastModified: Date }[]) {
  const prisma = {
    message: { findMany: vi.fn().mockResolvedValue([{ mediaKey: 'actors/a1/message/used.jpg' }]) },
    story: { findMany: vi.fn().mockResolvedValue([]) },
    actor: { findMany: vi.fn().mockResolvedValue([{ officialProfileImageUrl: 'https://placehold.co/x', chatProfileImageUrl: 'actors/a1/profile/p.jpg' }]) },
    agency: { findMany: vi.fn().mockResolvedValue([{ logoUrl: null }]) },
  } as unknown as PrismaService;
  const deleted: string[] = [];
  const storage = {
    isConfigured: true,
    // prefix별로 해당 객체만
    listObjects: async function* (prefix: string) {
      for (const o of objects) if (o.key.startsWith(prefix)) yield o;
    },
    delete: vi.fn((key: string) => {
      deleted.push(key);
      return Promise.resolve();
    }),
  } as unknown as StorageService;
  return { service: new UploadCleanupService(prisma, storage), deleted };
}

describe('UploadCleanupService', () => {
  it('하루 지난 미사용 파일만 지우고, 쓰는 파일·막 올린 파일은 남김', async () => {
    const { service, deleted } = setup([
      { key: 'actors/a1/message/used.jpg', lastModified: hoursAgo(48) },
      { key: 'actors/a1/message/orphan.jpg', lastModified: hoursAgo(48) },
      { key: 'actors/a1/message/fresh.jpg', lastModified: hoursAgo(2) },
      { key: 'actors/a1/profile/p.jpg', lastModified: hoursAgo(72) },
      { key: 'agencies/g1/logo/old.png', lastModified: hoursAgo(30) },
    ]);
    await expect(service.removeOrphanUploads(NOW)).resolves.toBe(2);
    expect(deleted.sort()).toEqual(['actors/a1/message/orphan.jpg', 'agencies/g1/logo/old.png']);
  });
});
