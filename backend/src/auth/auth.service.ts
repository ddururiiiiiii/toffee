import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import appleSignin from 'apple-signin-auth';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthProvider, Role } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { NICKNAME_CHANGE_COOLDOWN_MS, normalizeNickname } from '../common/nickname/nickname.js';

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
    private readonly moderationService: ModerationService,
  ) {
    this.googleClient = new OAuth2Client(this.configService.get<string>('GOOGLE_CLIENT_ID'));
  }

  async issueAccessToken(user: { id: string; role: Role }): Promise<{ accessToken: string }> {
    const accessToken = await this.jwtService.signAsync({ sub: user.id, role: user.role });
    return { accessToken };
  }

  // Google/Apple/Naver/Kakao/LINE 자격증명 없이 앱을 끝까지 테스트하기 위한 개발용 로그인.
  // DevOnlyGuard가 프로덕션에서 라우트 자체를 404로 숨김.
  async devLogin(email: string, name?: string, role?: Role): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.upsert({
      where: { email },
      update: role ? { role } : {},
      create: { email, displayName: name ?? this.generateFallbackName(), role: role ?? Role.USER },
    });
    return { id: user.id, role: user.role };
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

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, role: true, locale: true, nickname: true, nicknameChangedAt: true },
    });
    const { nicknameChangedAt, ...rest } = user;
    return { ...rest, nicknameChangeAvailableAt: nextNicknameChangeAt(user.nickname, nicknameChangedAt) };
  }

  /**
   * 닉네임 정하기/바꾸기 — 중복은 허용(버블 방식)하되 공식·운영자·배우 이름 흉내, 금칙어, 보이지 않는 문자는
   * 막고, 한 번 정한 뒤엔 7일에 한 번만 바꿀 수 있음(처음 정할 때는 제한 없음).
   */
  async updateNickname(userId: string, raw: string) {
    const nickname = normalizeNickname(raw);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { nickname: true, nicknameChangedAt: true },
    });
    if (user.nickname === nickname) return this.getMe(userId);

    const availableAt = nextNicknameChangeAt(user.nickname, user.nicknameChangedAt);
    if (availableAt && availableAt > new Date()) {
      throw new BadRequestException(`닉네임은 ${availableAt.toISOString().slice(0, 10)} 이후에 바꿀 수 있어요.`);
    }
    await this.moderationService.assertNoBannedWords(nickname).catch(() => {
      throw new BadRequestException('부적절한 표현이 포함된 닉네임은 쓸 수 없어요.');
    });
    const actorNameClash = await this.prisma.actor.findFirst({
      where: {
        OR: [
          { chatDisplayName: { equals: nickname, mode: 'insensitive' } },
          { legalName: { equals: nickname, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (actorNameClash) throw new BadRequestException('배우 이름과 같은 닉네임은 쓸 수 없어요.');

    await this.prisma.user.update({ where: { id: userId }, data: { nickname, nicknameChangedAt: new Date() } });
    return this.getMe(userId);
  }

  updateLocale(userId: string, locale: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { locale }, select: { id: true, role: true, locale: true } });
  }

  // 기기 등록 — 토큰은 한 계정에만 속함(같은 폰에서 계정을 바꿔 로그인하면 새 계정으로 옮겨감).
  // 한 계정은 여러 기기를 가질 수 있음.
  async registerPushDevice(userId: string, token: string, platform?: string): Promise<void> {
    await this.prisma.pushDevice.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  }

  // 이 기기만 해제(로그아웃) — 다른 기기 알림은 그대로
  async unregisterPushDevice(userId: string, token: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { userId, token } });
  }
}

// 처음 정한 닉네임(이전 값 없음)은 바로 바꿀 수 있고, 그 뒤엔 마지막 변경 + 7일
function nextNicknameChangeAt(nickname: string | null, changedAt: Date | null): Date | null {
  if (!nickname || !changedAt) return null;
  return new Date(changedAt.getTime() + NICKNAME_CHANGE_COOLDOWN_MS);
}
