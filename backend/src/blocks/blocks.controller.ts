import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { BlocksService } from './blocks.service.js';
import { CreateBlockDto } from './dto/create-block.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

@Roles(Role.ACTOR, Role.AGENCY_STAFF, Role.ADMIN)
@Controller('actors/:actorId/blocks')
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string) {
    return this.blocksService.list(user.id, actorId);
  }

  @Post()
  block(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string, @Body() dto: CreateBlockDto) {
    return this.blocksService.block(user.id, actorId, dto.fanUserId, dto.reason);
  }

  @Delete(':fanUserId')
  unblock(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string, @Param('fanUserId') fanUserId: string) {
    return this.blocksService.unblock(user.id, actorId, fanUserId);
  }
}
