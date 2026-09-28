import { Controller, Get, Query } from '@nestjs/common';
import { AdminStatsService } from './admin-stats.service.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';

@Roles(Role.ADMIN)
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly stats: AdminStatsService) {}

  // 앱 운영자 홈의 요약 숫자
  @Get('summary')
  summary() {
    return this.stats.summary();
  }

  // 일별 추이(기본 30일, 7~90일)
  @Get('daily')
  daily(@Query('days') days?: string) {
    const n = Number(days);
    return this.stats.daily(Number.isInteger(n) ? Math.min(Math.max(n, 7), 90) : 30);
  }

  @Get('breakdown')
  breakdown() {
    return this.stats.breakdown();
  }
}
