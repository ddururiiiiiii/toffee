import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ParentalConsentService } from './parental-consent.service.js';
import { SetBirthDateDto } from './dto/set-birth-date.dto.js';
import { RequestParentalConsentDto } from './dto/request-parental-consent.dto.js';
import { AcceptTermsDto } from './dto/accept-terms.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { matchAcceptLanguage, SUPPORTED_LOCALES, type SupportedLocale } from '../common/i18n/locales.js';
import { consentPage } from './consent-texts.js';

@Controller()
export class ParentalConsentController {
  constructor(private readonly parentalConsentService: ParentalConsentService) {}

  @Get('me/onboarding-status')
  getOnboardingStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.parentalConsentService.getOnboardingStatus(user.id);
  }

  @Post('me/terms-agreement')
  acceptTerms(@CurrentUser() user: AuthenticatedUser, @Body() dto: AcceptTermsDto) {
    return this.parentalConsentService.acceptTerms(user.id, dto.version, { countryCode: dto.countryCode, platform: dto.platform });
  }

  @Patch('me/birth-date')
  setBirthDate(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetBirthDateDto) {
    return this.parentalConsentService.setBirthDate(user.id, dto.birthDate);
  }

  @Post('me/parental-consent')
  requestConsent(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestParentalConsentDto) {
    return this.parentalConsentService.requestConsent(user.id, dto.parentEmail);
  }

  // 부모가 이메일로 받는 링크 — 앱 로그인 없이 브라우저에서 열림. 안내 페이지만 보여주고(동의 처리 X), 부모가
  // "동의합니다"를 누르면 아래 POST로 동의. 언어: 페이지의 언어 선택(lang) → 부모 브라우저 → 자녀 계정 언어 → 영어
  @Public()
  @Get('parental-consent/confirm')
  async confirmPage(
    @Query('token') token: string | undefined,
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { state, childLocale } = await this.parentalConsentService.consentPageState(token);
    const locale = pickLocale(lang, acceptLanguage, childLocale);
    sendPage(res, state === 'invalid' ? 400 : 200, consentPage(state, locale, state === 'ask' ? token : undefined));
  }

  @Public()
  @Post('parental-consent/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@Body('token') token: string | undefined, @Body('lang') lang: string | undefined, @Res() res: Response): Promise<void> {
    const locale = pickLocale(lang, undefined, null);
    try {
      await this.parentalConsentService.confirm(String(token ?? ''));
      sendPage(res, 200, consentPage('done', locale));
    } catch {
      sendPage(res, 400, consentPage('invalid', locale));
    }
  }
}

function pickLocale(lang: string | undefined, acceptLanguage: string | undefined, fallback: SupportedLocale | null): SupportedLocale {
  if (lang && (SUPPORTED_LOCALES as readonly string[]).includes(lang)) return lang as SupportedLocale;
  return matchAcceptLanguage(acceptLanguage) ?? fallback ?? 'en';
}

// 링크에 토큰이 들어 있어서 캐시·리퍼러로 새지 않게
function sendPage(res: Response, status: number, html: string): void {
  res.status(status).set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).type('html').send(html);
}
