import { Controller, Get, Query } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { RefundService, type RefundReason } from './refund.service.js';

class AdminRefundQueryDto {
  @IsOptional()
  @IsIn(['STAR_IDLE', 'ACTOR_RETIRED'])
  reason?: RefundReason;
}

/** 운영자 환불 요청 목록(2026-09-29) — 고객 문의 대응, 애플 안내 건의 실제 환불 여부, 배우·소속사별 환불 파악 */
@Roles(Role.ADMIN)
@Controller('admin/refunds')
export class AdminRefundsController {
  constructor(private readonly refunds: RefundService) {}

  @Get()
  list(@Query() query: AdminRefundQueryDto) {
    return this.refunds.adminList({ reason: query.reason });
  }
}
