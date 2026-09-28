import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from './storage.service.js';
import { isStorageKey } from './media-policy.js';

// 업로드 URL을 받고 올리기만 한 뒤 메시지·스토리·프로필에 붙이지 않은 파일(보내기 취소, 앱 종료 등)을 지움.
// 올리는 중이거나 막 올린 파일을 지우지 않게 하루 이상 지난 것만.
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const PREFIXES = ['actors/', 'agencies/'];

@Injectable()
export class UploadCleanupService {
  private readonly logger = new Logger(UploadCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** DB 어디선가 쓰고 있는 저장소 키 전부 — 파일럿 규모라 한 번에 읽음(커지면 prefix별로 나눠 확인) */
  async referencedKeys(): Promise<Set<string>> {
    const [messages, stories, actors, agencies] = await Promise.all([
      this.prisma.message.findMany({ where: { mediaKey: { not: null } }, select: { mediaKey: true, thumbnailKey: true } }),
      this.prisma.story.findMany({ where: { mediaKey: { not: null } }, select: { mediaKey: true } }),
      this.prisma.actor.findMany({ select: { officialProfileImageUrl: true, chatProfileImageUrl: true } }),
      this.prisma.agency.findMany({ select: { logoUrl: true } }),
    ]);
    const keys = [
      ...messages.flatMap((m) => [m.mediaKey, m.thumbnailKey]),
      ...stories.map((s) => s.mediaKey),
      ...actors.flatMap((a) => [a.officialProfileImageUrl, a.chatProfileImageUrl]),
      ...agencies.map((a) => a.logoUrl),
    ];
    return new Set(keys.filter(isStorageKey));
  }

  // 매일 새벽(태국 시간 04:30). 저장소 미설정(로컬)이면 건너뜀.
  @Cron('30 4 * * *', { timeZone: 'Asia/Bangkok' })
  async removeOrphanUploads(now = new Date()): Promise<number> {
    if (!this.storage.isConfigured) return 0;
    const referenced = await this.referencedKeys();
    const cutoff = now.getTime() - ORPHAN_GRACE_MS;
    let removed = 0;
    for (const prefix of PREFIXES) {
      for await (const object of this.storage.listObjects(prefix)) {
        if (object.lastModified.getTime() > cutoff || referenced.has(object.key)) continue;
        await this.storage.delete(object.key).catch(() => {});
        removed += 1;
      }
    }
    if (removed > 0) this.logger.log(`붙이지 않은 업로드 파일 ${removed}개 삭제`);
    return removed;
  }
}
