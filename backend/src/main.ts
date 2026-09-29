import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { checkEnv } from './common/config/env-check.js';

async function bootstrap() {
  // 빠진 설정값은 켜자마자 알림 — 치명적이면 여기서 멈춤(호스팅 로그에 이유가 남음)
  const logger = new Logger('Startup');
  const { errors, warnings } = checkEnv(process.env);
  warnings.forEach((warning) => logger.warn(warning));
  if (errors.length) {
    errors.forEach((error) => logger.error(error));
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 호스팅 프록시(로드밸런서) 뒤에서 실제 접속 IP를 읽도록 — 로그인 요청 횟수 제한이 IP 기준이라, 안 하면 모든 사람이
  // 프록시 IP 하나로 보여 서로의 한도를 나눠 씀. 값은 프록시 단계 수(보통 1) 또는 "true"(호스팅 문서 확인)
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true');
  // 배포·재시작 때 요청 처리·실시간 연결을 정리하고 끔(SIGTERM)
  app.enableShutdownHooks();
  // whitelist + forbidNonWhitelisted: DTO에 없는 필드가 오면 요청 자체를 거부
  // (예: 로그인 바디에 role 같은 필드를 몰래 끼워 보내는 걸 막음)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // 인증은 쿠키가 아니라 Authorization 헤더의 Bearer 토큰이라 CSRF 노출이 없음 —
  // 앱은 Expo Web(react-native-web)도 지원하므로 브라우저에서 오는 요청을 막지 않음
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
