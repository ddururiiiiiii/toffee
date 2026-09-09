import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';
import { AppleLoginDto } from './dto/apple-login.dto.js';
import { NaverLoginDto } from './dto/naver-login.dto.js';
import { KakaoLoginDto } from './dto/kakao-login.dto.js';
import { LineLoginDto } from './dto/line-login.dto.js';
import { AuthProvider } from '../generated/prisma/enums.js';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

const LOGIN_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('google')
  async loginWithGoogle(@Body() dto: GoogleLoginDto) {
    const identity = await this.authService.verifyGoogleToken(dto.idToken);
    const user = await this.authService.findOrCreateUser(AuthProvider.GOOGLE, identity, dto.agreedToTerms);
    return this.authService.issueAccessToken(user);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('apple')
  async loginWithApple(@Body() dto: AppleLoginDto) {
    const identity = await this.authService.verifyAppleToken(dto.idToken);
    // 애플 idToken엔 이름이 없어서, 최초 로그인 때 클라이언트가 보내준 이름을 여기서 덧붙임
    const user = await this.authService.findOrCreateUser(
      AuthProvider.APPLE,
      { ...identity, name: dto.name },
      dto.agreedToTerms,
    );
    return this.authService.issueAccessToken(user);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('naver')
  async loginWithNaver(@Body() dto: NaverLoginDto) {
    const identity = await this.authService.verifyNaverToken(dto.accessToken);
    const user = await this.authService.findOrCreateUser(AuthProvider.NAVER, identity, dto.agreedToTerms);
    return this.authService.issueAccessToken(user);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('kakao')
  async loginWithKakao(@Body() dto: KakaoLoginDto) {
    const identity = await this.authService.verifyKakaoToken(dto.accessToken);
    const user = await this.authService.findOrCreateUser(AuthProvider.KAKAO, identity, dto.agreedToTerms);
    return this.authService.issueAccessToken(user);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('line')
  async loginWithLine(@Body() dto: LineLoginDto) {
    const identity = await this.authService.verifyLineToken(dto.idToken);
    const user = await this.authService.findOrCreateUser(AuthProvider.LINE, identity, dto.agreedToTerms);
    return this.authService.issueAccessToken(user);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
