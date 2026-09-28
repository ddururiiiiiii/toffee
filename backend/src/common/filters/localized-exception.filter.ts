import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { captureException } from '@sentry/nestjs';
import type { Request } from 'express';
import { isErrorCode, translateError, type ErrorCode, type ErrorParams } from '../i18n/error-messages.js';
import { localeFromAcceptLanguage, type SupportedLocale } from '../i18n/locales.js';

// 코드 없이 던져진 예외(프레임워크 기본 예외 포함)는 상태 코드로 기본 문구를 고름
const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/**
 * 오류 응답을 { statusCode, code, message, details? }로 통일하고 message를 요청 언어로 번역.
 * - appError('코드')로 던진 예외: 그 코드의 문구
 * - ValidationPipe 오류(message 배열): "입력값을 확인해 주세요" + details에 원문(개발 확인용)
 * - 그 밖의 HttpException: 상태 코드별 기본 문구 + details에 원문(4xx만)
 * - 처리 안 된 예외: Sentry로 보내고 "일시적인 오류" 문구(원문은 응답에 넣지 않음)
 */
export function localizeHttpException(exception: HttpException, locale: SupportedLocale): HttpException {
  const status = exception.getStatus();
  const response = exception.getResponse();
  const body = typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : {};
  let code: ErrorCode;
  let params: ErrorParams | undefined;
  let details: unknown;
  if (isErrorCode(body.code)) {
    code = body.code;
    params = body.params as ErrorParams | undefined;
  } else if (status === HttpStatus.BAD_REQUEST && Array.isArray(body.message)) {
    code = 'VALIDATION_FAILED';
    details = body.message;
  } else {
    code = CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL' : 'BAD_REQUEST');
    if (status < 500) details = typeof response === 'string' ? response : body.message;
  }
  return new HttpException(
    { statusCode: status, code, message: translateError(code, locale, params), ...(details !== undefined ? { details } : {}) },
    status,
    { cause: exception },
  );
}

@Catch()
export class LocalizedExceptionFilter extends SentryGlobalFilter {
  private readonly errorLogger = new Logger('ExceptionsHandler');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return super.catch(exception, host);
    const locale = localeFromAcceptLanguage(host.switchToHttp().getRequest<Request>().headers['accept-language']);
    if (exception instanceof HttpException) return super.catch(localizeHttpException(exception, locale), host);

    // 처리 안 된 예외 — 아래에서 HttpException으로 바꾸면 Sentry 필터가 "예상된 오류"로 보고 건너뛰므로 여기서 직접 보고
    captureException(exception, { mechanism: { handled: false, type: 'auto.http.nestjs.global_filter' } });
    this.errorLogger.error(exception instanceof Error ? exception.message : String(exception), exception instanceof Error ? exception.stack : undefined);
    return super.catch(localizeHttpException(new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR), locale), host);
  }
}
