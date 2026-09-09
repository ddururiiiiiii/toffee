import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// 프로덕션에서 이 라우트가 있는지조차 모르게 403이 아니라 404를 던짐
@Injectable()
export class DevOnlyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const enabled = this.configService.get<string>('ENABLE_DEV_LOGIN') === 'true';
    if (isProd || !enabled) throw new NotFoundException();
    return true;
  }
}
