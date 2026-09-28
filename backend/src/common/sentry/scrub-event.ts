import type { ErrorEvent } from '@sentry/nestjs';

// 요청 바디에서 가릴 필드 — 소셜 로그인 토큰, 부모 이메일/생년월일 같은 PII, IAP 영수증
const SENSITIVE_BODY_KEYS = new Set([
  'idtoken',
  'accesstoken',
  'token',
  'password',
  'email',
  'parentemail',
  'birthdate',
  'signedtransaction',
  'purchasetoken',
  'fcmtoken',
]);
export const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-api-key']);

function redactBody(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(redactBody);
  if (data && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        SENSITIVE_BODY_KEYS.has(key.toLowerCase()) ? '[redacted]' : redactBody(value),
      ]),
    );
  }
  return data;
}

// 개인정보(PII)가 에러 리포트에 그대로 실려 나가지 않게 전송 직전에 걸러냄
// (보안 하드닝 체크리스트의 "민감정보 로깅 방지" 항목)
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (request) {
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [key, SENSITIVE_HEADERS.has(key.toLowerCase()) ? '[redacted]' : value]),
      );
    }
    delete request.cookies;
    if (request.data !== undefined) {
      if (typeof request.data === 'string') {
        try {
          request.data = JSON.stringify(redactBody(JSON.parse(request.data)));
        } catch {
          request.data = '[redacted]';
        }
      } else {
        request.data = redactBody(request.data);
      }
    }
    // 쿼리스트링에도 토큰이 실릴 수 있음(부모 동의 확인 링크 등)
    if (request.query_string) request.query_string = '[redacted]';
  }
  if (event.user) event.user = { id: event.user.id };
  return event;
}
