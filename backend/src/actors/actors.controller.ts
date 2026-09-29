import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ActorsService } from './actors.service.js';
import { ListActorsQueryDto } from './dto/list-actors-query.dto.js';
import { CreateChatProfileUploadDto, SetChatProfileImageDto } from './dto/chat-profile-image.dto.js';
import { UpdateActorNicknameDto } from './dto/update-actor-nickname.dto.js';
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
    return this.actorsService.findAll(query.q, query.agencyId, query.sort, query.kind);
  }

  // 'mine'은 ':id'보다 먼저 등록해야 함 — 안 그러면 "mine"이 id로 잡혀버림
  @Roles(Role.AGENCY_STAFF, Role.ACTOR, Role.ADMIN)
  @Get('mine')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.actorsService.findMine(user.id);
  }

  // 이 배우가 든 커플방(배우 프로필 "커플방")
  @Public()
  @Get(':id/couples')
  couples(@Param('id') id: string) {
    return this.actorsService.couplesOf(id);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.actorsService.findOne(id);
  }

  @Roles(Role.AGENCY_STAFF, Role.ACTOR, Role.ADMIN)
  @Get(':id/stats')
  getStats(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.actorsService.getStats(user.id, id);
  }

  // 배우 닉네임(채팅방에 보이는 이름) — 배우 본인만(소속사는 발송 권한과 마찬가지로 대신 못 바꿈)
  @Roles(Role.ACTOR, Role.ADMIN)
  @Patch(':id/nickname')
  updateNickname(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateActorNicknameDto) {
    return this.actorsService.updateNickname(user.id, id, dto.nickname);
  }

  // 대화방 사진 — 배우 본인·같은 소속사 직원·운영자(공식 사진·이름은 운영자 화면에서만, 2026-09-28 사용자 결정)
  @Roles(Role.AGENCY_STAFF, Role.ACTOR, Role.ADMIN)
  @Post(':id/chat-profile-image/upload')
  createChatProfileUpload(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateChatProfileUploadDto) {
    return this.actorsService.createChatProfileUpload(user.id, id, dto.contentType, dto.sizeBytes);
  }

  @Roles(Role.AGENCY_STAFF, Role.ACTOR, Role.ADMIN)
  @Patch(':id/chat-profile-image')
  setChatProfileImage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SetChatProfileImageDto) {
    return this.actorsService.setChatProfileImage(user.id, id, dto.key);
  }
}
