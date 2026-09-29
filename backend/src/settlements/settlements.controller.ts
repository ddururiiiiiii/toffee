import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SettlementsService } from './settlements.service.js';
import { SettlementQueryDto } from './dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

/** 월 정산 — 운영자는 전체(소속사 골라 보기 가능), 소속사 직원은 자기 소속사만. 앱은 PC 웹에서만 이 화면을 보여 줌 */
@Roles(Role.ADMIN, Role.AGENCY_STAFF)
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: SettlementQueryDto) {
    const scope = await this.settlements.scopeFor(user.id);
    return this.settlements.report(query.month, { agencyId: scope.agencyId ?? query.agencyId, includeSandbox: query.includeSandbox });
  }

  @Get('export')
  async export(@CurrentUser() user: AuthenticatedUser, @Query() query: SettlementQueryDto, @Res() res: Response) {
    const scope = await this.settlements.scopeFor(user.id);
    const report = await this.settlements.report(query.month, { agencyId: scope.agencyId ?? query.agencyId, includeSandbox: query.includeSandbox });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="toffee-settlement-${query.month}${query.detail ? '-rooms' : ''}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(this.settlements.toCsv(report, query.detail));
  }
}
