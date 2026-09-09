import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import appleSignin from 'apple-signin-auth';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthProvider, Role } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

interface ExternalIdentity {
  providerId: string;
  email: string | null;
  name?: string;
  profileImageUrl?: string;
}

const FETCH_TIMEOUT_MS = 5000;

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {
    this.googleClient = new OAuth2Client(this.configService.get<string>('GOOGLE_CLIENT_ID'));
  }

  async issueAccessToken(user: { id: string; role: Role }): Promise<{ accessToken: string }> {
    const accessToken = await this.jwtService.signAsync({ sub: user.id, role: user.role });
    return { accessToken };
  }

  // ── 소셜 토큰 검증 ──────────────────────────────────────────────

  async verifyGoogleToken(idToken: string): Promise<ExternalIdentity> {
    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) throw new UnauthorizedException('유효하지 않은 구글 토큰입니다.');
    return {
      providerId: payload.sub,
      email: payload.email ?? null,
      name: payload.name,
      profileImageUrl: payload.picture,
    };
  }

  async verifyAppleToken(idToken: string): Promise<ExternalIdentity> {
    const payload = await appleSignin.verifyIdToken(idToken, {
      audience: this.configService.getOrThrow<string>('APPLE_CLIENT_ID'),
    });
    if (!payload?.sub) throw new UnauthorizedException('유효하지 않은 애플 토큰입니다.');
    return { providerId: payload.sub, email: payload.email ?? null };
  }

  async verifyNaverToken(accessToken: string): Promise<ExternalIdentity> {
    const body = await this.fetchJson<{
      resultcode: string;
      response?: { id: string; email?: string; name?: string; nickname?: string; profile_image?: string };
    }>('https://openapi.naver.com/v1/nid/me', accessToken, '유효하지 않은 네이버 토큰입니다.');
    if (body.resultcode !== '00' || !body.response?.id) {
      throw new UnauthorizedException('유효하지 않은 네이버 토큰입니다.');
    }
    return {
      providerId: body.response.id,
      email: body.response.email ?? null,
      name: body.response.nickname ?? body.response.name,
      profileImageUrl: body.response.profile_image,
    };
  }

  async verifyKakaoToken(accessToken: string): Promise<ExternalIdentity> {
    const body = await this.fetchJson<{
      id?: number;
      kakao_account?: { email?: string; profile?: { nickname?: string; profile_image_url?: string } };
    }>('https://kapi.kakao.com/v2/user/me', accessToken, '유효하지 않은 카카오 토큰입니다.');
    if (body.id === undefined) throw new UnauthorizedException('유효하지 않은 카카오 토큰입니다.');
    return {
      providerId: String(body.id),
      email: body.kakao_account?.email ?? null,
      name: body.kakao_account?.profile?.nickname,
      profileImageUrl: body.kakao_account?.profile?.profile_image_url,
    };
  }

  async verifyLineToken(idToken: string): Promise<ExternalIdentity> {
    // LINE은 idToken 서명 키를 직접 관리하는 대신, LINE의 verify 엔드포인트에
    // id_token + client_id를 보내 검증도 하고 클레임도 같이 받는 방식(네이버/카카오와 동일 패턴)
    const clientId = this.configService.getOrThrow<string>('LINE_CHANNEL_ID');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) throw new UnauthorizedException('유효하지 않은 라인 토큰입니다.');
    const body = (await res.json()) as { sub?: string; email?: string; name?: string; picture?: string };
    if (!body.sub) throw new UnauthorizedException('유효하지 않은 라인 토큰입니다.');
    return {
      providerId: body.sub,
      email: body.email ?? null,
      name: body.name,
      profileImageUrl: body.picture,
    };
  }

  private async fetchJson<T>(url: string, accessToken: string, invalidMessage: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) throw new UnauthorizedException(invalidMessage);
    return (await res.json()) as T;
  }

  // ── 소셜 아이덴티티 → User ──────────────────────────────────────

  async findOrCreateUser(
    provider: AuthProvider,
    identity: ExternalIdentity,
    agreedToTerms?: boolean,
  ): Promise<AuthenticatedUser> {
    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerId: { provider, providerId: identity.providerId } },
      include: { user: true },
    });
    if (existingIdentity) {
      return { id: existingIdentity.user.id, role: existingIdentity.user.role };
    }

    // 같은 이메일로 이미 가입된 계정이 있으면(다른 제공자로 먼저 가입) 그 계정에 합침
    const existingUserByEmail = identity.email
      ? await this.prisma.user.findUnique({ where: { email: identity.email } })
      : null;

    if (!existingUserByEmail && !agreedToTerms) {
      throw new BadRequestException('이용약관 동의가 필요합니다.');
    }

    const user =
      existingUserByEmail ??
      (await this.prisma.user.create({
        data: {
          email: identity.email ?? undefined,
          displayName: identity.name ?? this.generateFallbackName(),
        },
      }));

    await this.prisma.authIdentity.create({
      data: { userId: user.id, provider, providerId: identity.providerId },
    });

    return { id: user.id, role: user.role };
  }

  private generateFallbackName(): string {
    return `팬${Date.now().toString(36)}`;
  }
}
