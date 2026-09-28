import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AdminAgenciesService } from './admin-agencies.service.js';
import { CreateAgencyDto, UpdateAgencyDto } from './dto/upsert-agency.dto.js';
import { AssignAgencyDto } from './dto/assign-agency.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminAgenciesController {
  constructor(private readonly adminAgenciesService: AdminAgenciesService) {}

  @Get('agencies')
  findAll() {
    return this.adminAgenciesService.findAll();
  }

  @Post('agencies')
  create(@Body() dto: CreateAgencyDto) {
    return this.adminAgenciesService.create(dto);
  }

  @Patch('agencies/:id')
  update(@Param('id') id: string, @Body() dto: UpdateAgencyDto) {
    return this.adminAgenciesService.update(id, dto);
  }

  @Patch('actors/:id/agency')
  assignActor(@Param('id') id: string, @Body() dto: AssignAgencyDto) {
    return this.adminAgenciesService.assignActor(id, dto.agencyId);
  }

  @Get('actors/:id/agency-history')
  actorHistory(@Param('id') id: string) {
    return this.adminAgenciesService.actorHistory(id);
  }

  @Patch('users/:id/agency')
  assignStaff(@Param('id') id: string, @Body() dto: AssignAgencyDto) {
    return this.adminAgenciesService.assignStaff(id, dto.agencyId);
  }
}
