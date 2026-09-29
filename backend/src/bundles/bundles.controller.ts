import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { BundlesService } from './bundles.service.js';
import { CreateBundleDto, UpdateBundleDto } from './dto/upsert-bundle.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

@Controller()
export class BundlesController {
  constructor(private readonly bundlesService: BundlesService) {}

  // 배우 프로필 "묶음으로 더 저렴하게"
  @Get('actors/:actorId/bundles')
  forActor(@Param('actorId') actorId: string) {
    return this.bundlesService.forActor(actorId);
  }

  @Get('bundles/:id')
  findOne(@Param('id') id: string) {
    return this.bundlesService.findOne(id);
  }
}

@Roles(Role.ADMIN)
@Controller('admin/bundles')
export class AdminBundlesController {
  constructor(private readonly bundlesService: BundlesService) {}

  @Get()
  list() {
    return this.bundlesService.adminList();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bundlesService.adminFindOne(id);
  }

  @Post()
  create(@CurrentUser() admin: AuthenticatedUser, @Body() dto: CreateBundleDto) {
    return this.bundlesService.create(admin.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateBundleDto) {
    return this.bundlesService.update(admin.id, id, dto);
  }
}
