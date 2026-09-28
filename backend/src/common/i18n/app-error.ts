import { translateError, type ErrorCode, type ErrorParams } from './error-messages.js';

/**
 * 예외 본문 — throw new BadRequestException(appError('REPLY_LIMIT', { limit: 3 })) 처럼 씀. message는 한국어
 * (서버 로그·테스트용)이고, 앱에 나가는 문구는 LocalizedExceptionFilter가 요청 언어로 다시 만듦.
 */
export interface AppErrorBody {
  code: ErrorCode;
  params?: ErrorParams;
  message: string;
}

export function appError(code: ErrorCode, params?: ErrorParams): AppErrorBody {
  return { code, ...(params ? { params } : {}), message: translateError(code, 'ko', params) };
}
