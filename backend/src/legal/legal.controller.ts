import { Controller, Get, Headers, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { matchAcceptLanguage, SUPPORTED_LOCALES, type SupportedLocale } from '../common/i18n/locales.js';
import { LEGAL_SECTIONS, LEGAL_VERSION, type LegalDoc } from './legal-texts.js';
import { legalPage, supportPage } from './legal-page.js';

const DOCS: readonly LegalDoc[] = ['terms', 'privacy'];

function pickLocale(lang: string | undefined, acceptLanguage: string | undefined): SupportedLocale {
  if (lang && (SUPPORTED_LOCALES as readonly string[]).includes(lang)) return lang as SupportedLocale;
  return matchAcceptLanguage(acceptLanguage) ?? 'en';
}

function ensureDoc(doc: string): LegalDoc {
  if (!(DOCS as readonly string[]).includes(doc)) throw new NotFoundException();
  return doc as LegalDoc;
}

/**
 * 공개 약관·개인정보처리방침·고객센터 페이지(로그인 불필요, 2026-09-29) — 스토어 등록(개인정보처리방침·지원 URL)과
 * 소셜 로그인 앱 등록에 공개 주소가 필요해서. 앱 화면은 같은 글을 /legal/:doc/sections(JSON)로 받음.
 */
@Public()
@SkipThrottle()
@Controller()
export class LegalController {
  constructor(private readonly config: ConfigService) {}

  @Get('legal/:doc')
  page(@Param('doc') doc: string, @Query('lang') lang: string | undefined, @Headers('accept-language') acceptLanguage: string | undefined, @Res() res: Response) {
    const html = legalPage(ensureDoc(doc), pickLocale(lang, acceptLanguage));
    res.set({ 'Cache-Control': 'public, max-age=300' }).type('html').send(html);
  }

  @Get('legal/:doc/sections')
  sections(@Param('doc') doc: string) {
    return { version: LEGAL_VERSION, sections: LEGAL_SECTIONS[ensureDoc(doc)] };
  }

  @Get('support')
  support(@Query('lang') lang: string | undefined, @Headers('accept-language') acceptLanguage: string | undefined, @Res() res: Response) {
    const email = this.config.get<string>('SUPPORT_EMAIL') || null;
    res.set({ 'Cache-Control': 'public, max-age=300' }).type('html').send(supportPage(pickLocale(lang, acceptLanguage), email));
  }
}
