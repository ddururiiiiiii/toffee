import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { seedDemo } from './demo-seed.js';
import { isDemoServer } from './demo-mode.js';

/**
 * 운영자 화면 "데모 초기화"(2026-10-01) — 데모 서버(DEMO_SEED가 있고 production이 아님)에서만 켜짐.
 * Railway 변수로 reset → true를 두 번 배포하던 걸 버튼 하나로. 데이터를 전부 지우는 기능이라 운영 서버에선 라우트도 404.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled(): boolean {
    return isDemoServer(this.configService.get<string>('DEMO_SEED')?.trim(), this.configService.get<string>('NODE_ENV'));
  }

  async reset(): Promise<void> {
    if (!this.isEnabled()) throw new NotFoundException();
    // 한 트랜잭션으로 — 중간에 실패하면 지운 것도 되돌아감. 쿼리가 많아 기본 5초보다 넉넉히
    await this.prisma.$transaction((tx) => seedDemo(tx), { timeout: 60_000, maxWait: 10_000 });
    this.logger.log('운영자 화면에서 데모 데이터를 초기화함');
  }
}
