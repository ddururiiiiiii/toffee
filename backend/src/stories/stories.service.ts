import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../notifications/push.service.js';
import { ensureCanViewActor, ensureIsActorSelf } from '../common/authorization/actor-access.js';
import { ensureActiveSubscription } from '../common/authorization/ensure-active-subscription.js';
import { Role } from '../generated/prisma/enums.js';
import type { CreateStoryDto } from './dto/create-story.dto.js';

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const CAN_MONITOR_ROLES = new Set<Role>([Role.AGENCY_STAFF, Role.ACTOR, Role.ADMIN]);

@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  // 배우 본인만 업로드 가능, 24시간 뒤 만료
  async create(actorSelfUserId: string, actorId: string, dto: CreateStoryDto) {
    await ensureIsActorSelf(this.prisma, actorSelfUserId, actorId);
    const story = await this.prisma.story.create({
      data: {
        actorId,
        mediaType: dto.mediaType,
        mediaUrl: dto.mediaUrl,
        expiresAt: new Date(Date.now() + STORY_LIFETIME_MS),
      },
    });

    // 소속사 모니터링용 알림 — 실패해도 업로드 자체엔 영향 없음
    await this.pushService.notifyActorStaff(actorId, '아티스트가 새 스토리를 올렸어요', '지금 확인해보세요').catch(() => {});

    return story;
  }

  // 팬은 구독자만, 소속사/배우 본인/관리자는 모니터링 목적으로 구독 여부와 무관하게 조회 가능
  async listActive(requesterId: string, actorId: string, requesterRole: Role) {
    if (CAN_MONITOR_ROLES.has(requesterRole)) {
      await ensureCanViewActor(this.prisma, requesterId, actorId);
    } else {
      await ensureActiveSubscription(this.prisma, requesterId, actorId);
    }
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
