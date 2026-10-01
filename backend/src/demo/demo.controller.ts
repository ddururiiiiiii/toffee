import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { DemoService } from './demo.service.js';

@Roles(Role.ADMIN)
@Controller('admin/demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  // 운영자 홈이 "데모 초기화" 버튼을 보일지
  @Get()
  status() {
    return { enabled: this.demo.isEnabled() };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset() {
    await this.demo.reset();
  }
}
