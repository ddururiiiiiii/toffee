import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReportDto) {
    return this.reportsService.create(user.id, dto.messageId, dto.reason);
  }

  // 'pending'은 ':id' 라우트보다 먼저 등록해야 함
  @Roles(Role.ADMIN)
  @Get('pending')
  findPending() {
    return this.reportsService.findPending();
  }

  @Roles(Role.ADMIN)
  @Patch(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.reportsService.resolve(id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/dismiss')
  dismiss(@Param('id') id: string) {
    return this.reportsService.dismiss(id);
  }
}
