import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 결제 없이 구독되는 테스트 경로(POST /actors/:id/subscribe) — ENABLE_SANDBOX_SUBSCRIBE=true일 때만 열림(기본 닫힘).
 * 예전엔 항상 열려 있어서 운영 서버에서도 누구나 API를 직접 불러 무료로 구독할 수 있었음(2026-09-28 점검).
 * 실제 결제(verify-purchase) 연결 전 비공개 테스트 서버에서만 켤 것. 닫혀 있으면 라우트가 없는 것처럼 404.
 */
@Injectable()
export class SandboxSubscribeGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (this.configService.get<string>('ENABLE_SANDBOX_SUBSCRIBE') !== 'true') throw new NotFoundException();
    return true;
  }
}
