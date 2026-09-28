import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UserStatus } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface JwtPayload {
  sub: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // JWT에 담긴 role은 신뢰하지 않고, 매 요청마다 DB에서 최신 role을 다시 읽음
  // — 권한이 바뀌면(예: 소속사 스태프 지정) 재로그인 없이 바로 반영됨
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();
    if (user.status === UserStatus.BANNED) {
      throw new UnauthorizedException('이용이 제한된 계정이에요.');
    }
    // 정지 기간이 지났으면 상태값은 그대로여도(별도 재활성화 없이) 다시 이용 가능하게 취급
    if (user.status === UserStatus.SUSPENDED && user.suspendedUntil && user.suspendedUntil > new Date()) {
      // 언제 풀리는지 같이 알려줌(태국 시간 기준 날짜·시각 — 서버 오류 문구 다국어화는 2차)
      const until = user.suspendedUntil.toLocaleString('ko-KR', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
      throw new UnauthorizedException(`일시정지된 계정이에요. ${until}(태국 시간)부터 다시 이용할 수 있어요.`);
    }
    return { id: user.id, role: user.role };
  }
}
