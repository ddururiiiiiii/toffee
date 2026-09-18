import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { StoriesService } from './stories.service.js';
import { CreateStoryDto } from './dto/create-story.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

@Controller('actors/:actorId/stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  // 배우 본인만 업로드 가능 — 소속사는 발송 권한 없음(읽기 전용 모니터링만)
  @Roles(Role.ACTOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string, @Body() dto: CreateStoryDto) {
    return this.storiesService.create(user.id, actorId, dto);
  }

  @Get()
  listActive(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string) {
    return this.storiesService.listActive(user.id, actorId, user.role);
  }

  @Post(':storyId/view')
  markViewed(
    @CurrentUser() user: AuthenticatedUser,
    @Param('actorId') actorId: string,
    @Param('storyId') storyId: string,
  ) {
    return this.storiesService.markViewed(user.id, actorId, storyId);
  }

  @Roles(Role.AGENCY_STAFF, Role.ACTOR, Role.ADMIN)
  @Get(':storyId/views')
  listViews(
    @CurrentUser() user: AuthenticatedUser,
    @Param('actorId') actorId: string,
    @Param('storyId') storyId: string,
  ) {
    return this.storiesService.listViews(user.id, actorId, storyId);
  }
}
