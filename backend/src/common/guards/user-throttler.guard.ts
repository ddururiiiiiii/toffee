import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * 요청 횟수 제한을 로그인한 계정 단위로(2026-09-29) — 예전엔 IP 단위라, 통신사가 여러 사람을 한 IP로 묶는
 * 모바일 망(태국·한국 모두 흔함)이나 호스팅 프록시 뒤에서 팬들이 서로의 한도를 나눠 쓰다 막힐 수 있었음
 * (출시 규모를 배우 5~10명으로 정정하면서 점검). 토큰 서명이 맞을 때만 계정으로 세고, 없거나 가짜면 IP로 —
 * 가짜 토큰을 바꿔 가며 IP 제한을 피하지 못하게. 로그인 요청은 토큰이 없어서 그대로 IP 단위.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  private readonly jwt = new JwtService({ secret: process.env.JWT_SECRET });

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const header = (req.headers as Record<string, string | undefined> | undefined)?.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub?: string }>(header.slice(7));
        if (payload.sub) return `user:${payload.sub}`;
      } catch {
        // 만료·가짜 토큰 — IP로
      }
    }
    return super.getTracker(req);
  }
}
