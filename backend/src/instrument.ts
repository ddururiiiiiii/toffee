import * as Sentry from '@sentry/nestjs';
import { SENSITIVE_HEADERS, scrubEvent } from './common/sentry/scrub-event.js';

// 이 파일은 앱 코드보다 먼저 로드돼야 함 — 백엔드가 ESM("type": "module")이라 main.ts에서 import해도
// 다른 import들보다 먼저 실행된다는 보장이 없어서, `node --import ./dist/instrument.js dist/main`
// (npm run start:prod)으로 미리 로드함(Sentry 공식 ESM 가이드 방식).
// SENTRY_DSN이 비어 있으면 SDK가 아무것도 전송하지 않고 조용히 꺼진 채로 동작함(로컬 개발용).

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // 1차 방어: 애초에 수집 범위를 좁힘(쿠키/쿼리스트링/응답 바디/사용자 IP 등 자동 수집 끔).
  // 요청 바디는 디버깅에 필요해서 받되, 2차 방어로 beforeSend에서 민감 필드를 가림.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: { deny: [...SENSITIVE_HEADERS] }, response: false },
    httpBodies: ['incomingRequest'],
    urlQueryParams: false,
  },
  beforeSend: scrubEvent,
});
