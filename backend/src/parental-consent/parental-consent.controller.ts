import { Body, Controller, Get, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ParentalConsentService } from './parental-consent.service.js';
import { SetBirthDateDto } from './dto/set-birth-date.dto.js';
import { RequestParentalConsentDto } from './dto/request-parental-consent.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

@Controller()
export class ParentalConsentController {
  constructor(private readonly parentalConsentService: ParentalConsentService) {}

  @Get('me/onboarding-status')
  getOnboardingStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.parentalConsentService.getOnboardingStatus(user.id);
  }

  @Patch('me/birth-date')
  setBirthDate(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetBirthDateDto) {
    return this.parentalConsentService.setBirthDate(user.id, new Date(dto.birthDate));
  }

  @Post('me/parental-consent')
  requestConsent(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestParentalConsentDto) {
    return this.parentalConsentService.requestConsent(user.id, dto.parentEmail);
  }

  // 부모가 이메일로 받는 링크 — 앱 로그인 없이 브라우저에서 그냥 열림
  @Public()
  @Get('parental-consent/confirm')
  async confirm(@Query('token') token: string, @Res() res: Response): Promise<void> {
    try {
      await this.parentalConsentService.confirm(token);
      res
        .type('html')
        .send('<html><body><h1>동의가 완료됐어요</h1><p>이제 자녀분이 앱을 계속 이용할 수 있어요.</p></body></html>');
    } catch {
      res.status(400).type('html').send('<html><body><h1>링크가 유효하지 않거나 만료됐어요</h1></body></html>');
    }
  }
}
