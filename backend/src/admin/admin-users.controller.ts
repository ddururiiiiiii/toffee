import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { SuspendUserDto } from './dto/suspend-user.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';

@Roles(Role.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  findAll(@Query() query: ListUsersQueryDto) {
    return this.adminUsersService.findAll(query.q);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string, @Body() dto: SuspendUserDto) {
    return this.adminUsersService.suspend(id, new Date(dto.until));
  }

  @Patch(':id/ban')
  ban(@Param('id') id: string) {
    return this.adminUsersService.ban(id);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.adminUsersService.reactivate(id);
  }
}
