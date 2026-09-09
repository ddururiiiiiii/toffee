import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service.js';

/** FCM이 "이 토큰은 더 이상 유효하지 않다"고 알려줄 때의 에러 코드 — 재시도해도 계속 실패하므로 저장된 토큰을 지워야 함 */
const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private app: App | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const serviceAccountJson = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON이 설정되지 않아 FCM 발송이 비활성화됩니다.');
      return;
    }
    const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
    this.app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  }

  /** userId로 등록된 토큰을 찾아 발송하고, 죽은 토큰이면 DB에서 지워서 다음 로그인 때 새 토큰이 등록되게 함 */
  async sendToUser(userId: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
    if (!user?.fcmToken) return;

    const result = await this.send(user.fcmToken, title, body, data);
    if (result.invalidToken) {
      await this.prisma.user.update({ where: { id: userId }, data: { fcmToken: null } });
    }
  }

  private async send(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<{ ok: boolean; invalidToken: boolean }> {
    if (!this.app) return { ok: false, invalidToken: false };
    try {
      await getMessaging(this.app).send({ token, notification: { title, body }, data });
      return { ok: true, invalidToken: false };
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      const invalidToken = !!code && INVALID_TOKEN_ERROR_CODES.has(code);
      this.logger.warn(`FCM 발송 실패: ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, invalidToken };
    }
  }
}
