import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging, type Message } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role, UserStatus } from '../generated/prisma/enums.js';

export interface PushRecipient {
  locale: string | null;
  /** 받는 사람 이름 — 닉네임(없으면 로그인 이름). {{name}} 치환용 */
  displayName: string;
}
export type ComposePush = (recipient: PushRecipient) => { title: string; body: string };

/** FCM이 "이 토큰은 더 이상 유효하지 않다"고 알려줄 때의 에러 코드 — 재시도해도 계속 실패하므로 저장된 토큰을 지워야 함 */
const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

// FCM sendEach 한 번에 보낼 수 있는 최대 메시지 수
const FCM_BATCH_SIZE = 500;

export interface PushDeviceTarget {
  token: string;
  user: PushRecipient;
}

/** 기기별 메시지 만들기 — 받는 사람마다 언어·이름이 달라서 기기마다 따로 조립(순수 함수, 테스트용으로 분리) */
export function buildPushMessages(devices: PushDeviceTarget[], compose: ComposePush, data?: Record<string, string>): Message[] {
  return devices.map(({ token, user }) => {
    const { title, body } = compose(user);
    return {
      token,
      notification: { title, body },
      data,
      android: { priority: 'high', notification: { channelId: 'messages' } },
      apns: { payload: { aps: { sound: 'default' } } },
    };
  });
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

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

  /** 한 사람의 모든 기기로 */
  sendToUser(userId: string, compose: ComposePush, data?: Record<string, string>): Promise<void> {
    return this.sendToUsers([userId], compose, data);
  }

  /**
   * 여러 사람의 모든 기기로 — 받는 사람 언어·이름에 맞춰 기기마다 문구를 만들고 500개씩 묶어 발송
   * (구독자가 수천 명이어도 사람마다 따로 요청하지 않게). FCM이 죽었다고 알려준 토큰은 바로 삭제.
   * 실패는 로그만 남기고 호출한 쪽 흐름을 막지 않음(best-effort).
   */
  async sendToUsers(userIds: string[], compose: ComposePush, data?: Record<string, string>): Promise<void> {
    if (!this.app || userIds.length === 0) return;
    // 정지·영구차단·탈퇴한 계정엔 보내지 않음(예전엔 구독만 보고 보내서 제재 중인 팬도 알림을 계속 받았음, 2026-09-28 점검).
    // 정지는 기간이 지났으면 다시 받음(로그인 판단과 같은 기준)
    const now = new Date();
    const devices = await this.prisma.pushDevice.findMany({
      where: {
        userId: { in: userIds },
        user: {
          deletedAt: null,
          OR: [{ status: UserStatus.ACTIVE }, { status: UserStatus.SUSPENDED, suspendedUntil: { lte: now } }],
        },
      },
      select: { token: true, user: { select: { locale: true, displayName: true, nickname: true } } },
    });
    if (devices.length === 0) return;

    const messaging = getMessaging(this.app);
    const deadTokens: string[] = [];
    const targets = devices.map(({ token, user }) => ({
      token,
      user: { locale: user.locale, displayName: user.nickname ?? user.displayName },
    }));
    for (const batch of chunk(buildPushMessages(targets, compose, data), FCM_BATCH_SIZE)) {
      try {
        const result = await messaging.sendEach(batch);
        result.responses.forEach((response, index) => {
          const code = response.error?.code;
          if (code && INVALID_TOKEN_ERROR_CODES.has(code)) deadTokens.push((batch[index] as { token: string }).token);
        });
        if (result.failureCount > 0) this.logger.warn(`FCM 발송 ${batch.length}건 중 ${result.failureCount}건 실패`);
      } catch (error) {
        this.logger.warn(`FCM 발송 실패: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (deadTokens.length > 0) await this.prisma.pushDevice.deleteMany({ where: { token: { in: deadTokens } } });
  }

  // 배우가 새 메시지를 보낼 때 현재 소속사 스태프 전원에게 알림(모니터링용) — best-effort
  async notifyActorStaff(actorId: string, compose: ComposePush, data?: Record<string, string>): Promise<void> {
    const actor = await this.prisma.actor.findUnique({ where: { id: actorId }, select: { agencyId: true } });
    if (!actor?.agencyId) return;
    const staff = await this.prisma.user.findMany({
      where: { agencyId: actor.agencyId, role: Role.AGENCY_STAFF },
      select: { id: true },
    });
    await this.sendToUsers(
      staff.map((user) => user.id),
      compose,
      data,
    );
  }
}
