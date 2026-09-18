import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ensureCanViewActor, ensureIsActorSelf } from '../common/authorization/actor-access.js';
import { ensureActiveSubscription } from '../common/authorization/ensure-active-subscription.js';
import type { CreateStoryDto } from './dto/create-story.dto.js';

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // 배우 본인만 업로드 가능, 24시간 뒤 만료
  async create(actorSelfUserId: string, actorId: string, dto: CreateStoryDto) {
    await ensureIsActorSelf(this.prisma, actorSelfUserId, actorId);
    return this.prisma.story.create({
      data: {
        actorId,
        mediaType: dto.mediaType,
        mediaUrl: dto.mediaUrl,
        expiresAt: new Date(Date.now() + STORY_LIFETIME_MS),
      },
    });
  }

  // 팬용 — 구독자만, 만료 안 된 것만
  async listActive(userId: string, actorId: string) {
    await ensureActiveSubscription(this.prisma, userId, actorId);
    return this.prisma.story.findMany({
      where: { actorId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // 팬이 스토리를 열람했음을 기록 (같은 스토리 재조회는 upsert로 무시)
  async markViewed(userId: string, actorId: string, storyId: string) {
    const story = await this.prisma.story.findFirst({ where: { id: storyId, actorId } });
    if (!story) throw new NotFoundException('스토리를 찾을 수 없습니다.');
    await ensureActiveSubscription(this.prisma, userId, actorId);

    return this.prisma.storyView.upsert({
      where: { storyId_fanUserId: { storyId, fanUserId: userId } },
      update: {},
      create: { storyId, fanUserId: userId },
    });
  }

  // 배우 본인/소속사 스태프/관리자 — 누가 봤는지 확인
  async listViews(requesterId: string, actorId: string, storyId: string) {
    await ensureCanViewActor(this.prisma, requesterId, actorId);
    const story = await this.prisma.story.findFirst({ where: { id: storyId, actorId } });
    if (!story) throw new NotFoundException('스토리를 찾을 수 없습니다.');

    return this.prisma.storyView.findMany({
      where: { storyId },
      include: { fanUser: { select: { id: true, displayName: true } } },
      orderBy: { viewedAt: 'desc' },
    });
  }
}
