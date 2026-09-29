import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SettlementsService } from './settlements.service.js';
import { SettlementPayoutDto, SettlementQueryDto } from './dto.js';
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

  // 마감·마감 취소는 운영자만(지급 근거를 고정하는 일)
  @Roles(Role.ADMIN)
  @Post(':month/close')
  close(@CurrentUser() user: AuthenticatedUser, @Param('month') month: string, @Query('includeSandbox') includeSandbox?: string) {
    return this.settlements.close(user.id, month, includeSandbox === undefined ? undefined : includeSandbox === 'true');
  }

  @Roles(Role.ADMIN)
  @Delete(':month/close')
  reopen(@CurrentUser() user: AuthenticatedUser, @Param('month') month: string) {
    return this.settlements.reopen(user.id, month);
  }

  // 지급 기록(운영자) — 마감한 달의 지급액을 언제·얼마·어떤 이체로 보냈는지. 소속사 직원은 정산표에서 자기 것만 봄
  @Roles(Role.ADMIN)
  @Post(':month/payouts')
  recordPayout(@CurrentUser() user: AuthenticatedUser, @Param('month') month: string, @Body() dto: SettlementPayoutDto) {
    return this.settlements.recordPayout(user.id, month, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':month/payouts/:payoutId')
  @HttpCode(204)
  deletePayout(@CurrentUser() user: AuthenticatedUser, @Param('month') month: string, @Param('payoutId') payoutId: string) {
    return this.settlements.deletePayout(user.id, month, payoutId);
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
