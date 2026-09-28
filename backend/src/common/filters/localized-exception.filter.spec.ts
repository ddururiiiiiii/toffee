import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { localizeHttpException } from './localized-exception.filter.js';
import { appError } from '../i18n/app-error.js';
import { ERROR_MESSAGES, translateError } from '../i18n/error-messages.js';
import { localeFromAcceptLanguage, SUPPORTED_LOCALES } from '../i18n/locales.js';

const body = (exception: HttpException) => exception.getResponse() as Record<string, unknown>;

describe('오류 문구 다국어', () => {
  it('appError로 던진 예외는 요청 언어로 번역되고 code가 붙음', () => {
    const localized = localizeHttpException(new BadRequestException(appError('REPLY_LIMIT', { limit: 3 })), 'th');
    expect(localized.getStatus()).toBe(400);
    expect(body(localized)).toEqual({ statusCode: 400, code: 'REPLY_LIMIT', message: 'ตอบกลับข้อความนี้ได้สูงสุด 3 ครั้ง กรุณารอข้อความถัดไปจากสตาร์' });
  });

  it('서버 로그·테스트용 message는 한국어', () => {
    expect(new NotFoundException(appError('ACTOR_NOT_FOUND')).message).toBe('배우를 찾을 수 없어요.');
  });

  it('ValidationPipe 오류(배열)는 "입력값을 확인해 주세요" + details에 원문', () => {
    const localized = localizeHttpException(new BadRequestException(['body must be a string']), 'en');
    expect(body(localized)).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Please check what you entered.', details: ['body must be a string'] });
  });

  it('코드 없는 예외는 상태 코드별 기본 문구', () => {
    expect(body(localizeHttpException(new ForbiddenException(), 'ja'))).toMatchObject({ code: 'FORBIDDEN', message: 'この操作を行う権限がありません。' });
    expect(body(localizeHttpException(new HttpException('boom', 500), 'ko'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL',
      message: '일시적인 오류가 생겼어요. 잠시 후 다시 시도해 주세요.',
    });
  });

  it('날짜 파라미터는 받는 사람 언어로(태국 시간)', () => {
    const until = '2026-10-01T05:00:00.000Z'; // 태국 12:00
    expect(translateError('ACCOUNT_SUSPENDED', 'en', { until })).toContain('Oct 1, 2026');
    expect(translateError('ACCOUNT_SUSPENDED', 'en', { until })).toContain('12:00');
  });

  it('모든 코드에 6개 언어 문구가 있음', () => {
    for (const [code, texts] of Object.entries(ERROR_MESSAGES)) {
      for (const locale of SUPPORTED_LOCALES) expect(texts[locale], `${code}.${locale}`).toBeTruthy();
    }
  });

  it('Accept-Language 판별', () => {
    expect(localeFromAcceptLanguage('th')).toBe('th');
    expect(localeFromAcceptLanguage('ko-KR,ko;q=0.9,en;q=0.8')).toBe('ko');
    expect(localeFromAcceptLanguage('zh-Hant')).toBe('zh-Hant');
    expect(localeFromAcceptLanguage('zh-TW')).toBe('zh-Hant');
    expect(localeFromAcceptLanguage('zh-CN')).toBe('zh-Hans');
    expect(localeFromAcceptLanguage('fr-FR')).toBe('en');
    expect(localeFromAcceptLanguage(undefined)).toBe('en');
  });
});

describe('LocalizedExceptionFilter (실제 HTTP 응답)', () => {
  it('앱이 보낸 Accept-Language로 번역된 본문을 돌려줌', async () => {
    const { Controller, Get, Module } = await import('@nestjs/common');
    const { APP_FILTER } = await import('@nestjs/core');
    const { Test } = await import('@nestjs/testing');
    const request = (await import('supertest')).default;
    const { LocalizedExceptionFilter } = await import('./localized-exception.filter.js');

    @Controller()
    class ProbeController {
      @Get('coded')
      coded() {
        throw new BadRequestException(appError('REPLY_BLOCKED'));
      }
      @Get('crash')
      crash() {
        throw new Error('db exploded: secret detail');
      }
    }
    @Module({ controllers: [ProbeController], providers: [{ provide: APP_FILTER, useClass: LocalizedExceptionFilter }] })
    class ProbeModule {}

    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    try {
      const coded = await request(app.getHttpServer()).get('/coded').set('Accept-Language', 'zh-Hant');
      expect(coded.status).toBe(400);
      expect(coded.body).toEqual({ statusCode: 400, code: 'REPLY_BLOCKED', message: '你無法在此頻道回覆。' });

      const crash = await request(app.getHttpServer()).get('/crash').set('Accept-Language', 'th');
      expect(crash.status).toBe(500);
      expect(crash.body).toEqual({ statusCode: 500, code: 'INTERNAL', message: 'เกิดข้อผิดพลาดชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลัง' });

      const missing = await request(app.getHttpServer()).get('/nope');
      expect(missing.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: 'Not found.' });
    } finally {
      await app.close();
    }
  });
});
