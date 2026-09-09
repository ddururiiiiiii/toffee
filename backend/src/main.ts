import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // whitelist + forbidNonWhitelisted: DTO에 없는 필드가 오면 요청 자체를 거부
  // (예: 로그인 바디에 role 같은 필드를 몰래 끼워 보내는 걸 막음)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // 인증은 쿠키가 아니라 Authorization 헤더의 Bearer 토큰이라 CSRF 노출이 없음 —
  // 앱은 Expo Web(react-native-web)도 지원하므로 브라우저에서 오는 요청을 막지 않음
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
