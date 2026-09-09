import { Controller, Get, Param, Query } from '@nestjs/common';
import { ActorsService } from './actors.service.js';
import { ListActorsQueryDto } from './dto/list-actors-query.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

@Controller('actors')
export class ActorsController {
  constructor(private readonly actorsService: ActorsService) {}

  @Public()
  @Get()
  findAll(@Query() query: ListActorsQueryDto) {
    return this.actorsService.findAll(query.q);
  }

  // 'mine'은 ':id'보다 먼저 등록해야 함 — 안 그러면 "mine"이 id로 잡혀버림
  @Roles(Role.AGENCY_STAFF, Role.ADMIN)
  @Get('mine')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.actorsService.findMine(user.id, user.role);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.actorsService.findOne(id);
  }

  @Roles(Role.AGENCY_STAFF, Role.ADMIN)
  @Get(':id/stats')
  getStats(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.actorsService.getStats(user.id, id);
  }
}
