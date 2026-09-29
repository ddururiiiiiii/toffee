import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service.js';
import { Public } from './common/decorators/public.decorator.js';
import { PrismaService } from './prisma/prisma.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // 살아 있는지만(가벼움) — 호스팅의 "재시작할지" 판단용
  @Public()
  @SkipThrottle()
  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  // DB까지 닿는지 — 호스팅의 "요청을 보내도 되는지" 판단용(배포 직후 준비 확인). DB가 안 되면 503
  @Public()
  @SkipThrottle()
  @Get('health/ready')
  async getReady(): Promise<{ status: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
