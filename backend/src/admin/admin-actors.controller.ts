import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AdminActorsService } from './admin-actors.service.js';
import { CreateActorDto, LinkActorUserDto, UpdateActorDto, UpdateActorImagesDto } from './dto/upsert-actor.dto.js';
import { CreateProfileUploadDto } from './dto/create-profile-upload.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';

// 소속사 지정(이적)·이력은 AdminAgenciesController(PATCH /admin/actors/:id/agency) 쪽
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminActorsController {
  constructor(private readonly adminActorsService: AdminActorsService) {}

  @Get('actors')
  findAll(@Query() query: ListUsersQueryDto) {
    return this.adminActorsService.findAll(query.q);
  }

  @Get('actors/:id')
  findOne(@Param('id') id: string) {
    return this.adminActorsService.findOne(id);
  }

  @Post('actors')
  create(@Body() dto: CreateActorDto) {
    return this.adminActorsService.create(dto);
  }

  @Patch('actors/:id')
  update(@Param('id') id: string, @Body() dto: UpdateActorDto) {
    return this.adminActorsService.update(id, dto);
  }

  @Patch('actors/:id/images')
  updateImages(@Param('id') id: string, @Body() dto: UpdateActorImagesDto) {
    return this.adminActorsService.updateImages(id, dto);
  }

  @Patch('actors/:id/self-user')
  linkUser(@Param('id') id: string, @Body() dto: LinkActorUserDto) {
    return this.adminActorsService.linkUser(id, dto.userId);
  }

  @Post('uploads')
  createUpload(@Body() dto: CreateProfileUploadDto) {
    return this.adminActorsService.createProfileUpload(dto.target, dto.targetId, dto.contentType, dto.sizeBytes);
  }
}
