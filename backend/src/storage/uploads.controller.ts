import { Body, Controller, Param, Post } from '@nestjs/common';
import { MediaService } from './media.service.js';
import { CreateUploadDto } from './dto/create-upload.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ensureIsActorSelf } from '../common/authorization/actor-access.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

// 배우 본인(또는 ADMIN)만 — 메시지·스토리 발송 권한과 동일(소속사는 발송 권한 없음)
@Controller('actors/:actorId/uploads')
export class UploadsController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles(Role.ACTOR, Role.ADMIN)
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string, @Body() dto: CreateUploadDto) {
    await ensureIsActorSelf(this.prisma, user.id, actorId);
    return this.mediaService.createUpload(actorId, dto.purpose, dto.mediaType, dto.contentType, dto.sizeBytes);
  }
}
