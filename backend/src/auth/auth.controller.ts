import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';
import { AppleLoginDto } from './dto/apple-login.dto.js';
import { NaverLoginDto } from './dto/naver-login.dto.js';
import { KakaoLoginDto } from './dto/kakao-login.dto.js';
import { LineLoginDto } from './dto/line-login.dto.js';
import { WebCodeLoginDto } from './dto/web-code-login.dto.js';
import { DevLoginDto } from './dto/dev-login.dto.js';
import { UpdateLocaleDto } from './dto/update-locale.dto.js';
import { PushDeviceDto } from './dto/push-device.dto.js';
import { UpdateNicknameDto } from './dto/update-nickname.dto.js';
import { AuthProvider, Role } from '../generated/prisma/enums.js';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { DevOnlyGuard } from '../common/guards/dev-only.guard.js';
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
    const user = await this.authService.findOrCreateUser(AuthProvider.GOOGLE, identity);
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
    );
    return this.authService.issueAccessToken(user);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('naver')
  async loginWithNaver(@Body() dto: NaverLoginDto) {
    const identity = await this.authService.verifyNaverToken(dto.accessToken);
    const user = await this.authService.findOrCreateUser(AuthProvider.NAVER, identity);
    return this.authService.issueAccessToken(user);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('kakao')
  async loginWithKakao(@Body() dto: KakaoLoginDto) {
    const identity = await this.authService.verifyKakaoToken(dto.accessToken);
    const user = await this.authService.findOrCreateUser(AuthProvider.KAKAO, identity);
    return this.authService.issueAccessToken(user);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('line')
  async loginWithLine(@Body() dto: LineLoginDto) {
    const identity = await this.authService.verifyLineToken(dto.idToken);
    const user = await this.authService.findOrCreateUser(AuthProvider.LINE, identity);
    return this.authService.issueAccessToken(user);
  }

  // PC 웹 로그인 — 회사 로그인 페이지가 돌려준 code를 서버가 교환(앱은 위의 토큰 방식)
  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('kakao/web')
  async loginWithKakaoWeb(@Body() dto: WebCodeLoginDto) {
    const identity = await this.authService.verifyKakaoWebCode(dto.code, dto.redirectUri);
    return this.authService.issueAccessToken(await this.authService.findOrCreateUser(AuthProvider.KAKAO, identity));
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('naver/web')
  async loginWithNaverWeb(@Body() dto: WebCodeLoginDto) {
    const identity = await this.authService.verifyNaverWebCode(dto.code, dto.state, dto.redirectUri);
    return this.authService.issueAccessToken(await this.authService.findOrCreateUser(AuthProvider.NAVER, identity));
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('line/web')
  async loginWithLineWeb(@Body() dto: WebCodeLoginDto) {
    const identity = await this.authService.verifyLineWebCode(dto.code, dto.redirectUri);
    return this.authService.issueAccessToken(await this.authService.findOrCreateUser(AuthProvider.LINE, identity));
  }

  @Public()
  @UseGuards(DevOnlyGuard)
  @Post('dev-login')
  async devLogin(@Body() dto: DevLoginDto) {
    const user = await this.authService.devLogin(dto.email, dto.name, dto.role as Role | undefined);
    return this.authService.issueAccessToken(user);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }

  // 푸시 받을 기기 등록 — 앱이 로그인 후, 그리고 FCM이 토큰을 바꿀 때마다 보냄. 여러 기기 가능.
  @Put('me/push-devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerPushDevice(@CurrentUser() user: AuthenticatedUser, @Body() dto: PushDeviceDto) {
    await this.authService.registerPushDevice(user.id, dto.token, dto.platform);
  }

  // 로그아웃 시 이 기기만 해제 — 같은 폰으로 다른 계정이 로그인했을 때 앞 사람 알림이 오지 않게
  @Post('me/push-devices/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregisterPushDevice(@CurrentUser() user: AuthenticatedUser, @Body() dto: PushDeviceDto) {
    await this.authService.unregisterPushDevice(user.id, dto.token);
  }

  // 닉네임 정하기/바꾸기(온보딩, 마이페이지)
  @Patch('me/nickname')
  updateNickname(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateNicknameDto) {
    return this.authService.updateNickname(user.id, dto.nickname);
  }

  // 회원 탈퇴(팬 본인) — 성공하면 앱이 로그아웃
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.deleteAccount(user.id);
  }

  // 앱 표시 언어 동기화 — 푸시 등 서버가 만드는 문구의 언어를 정하는 데 씀
  @Patch('me/locale')
  updateLocale(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateLocaleDto) {
    return this.authService.updateLocale(user.id, dto.locale);
  }
}
