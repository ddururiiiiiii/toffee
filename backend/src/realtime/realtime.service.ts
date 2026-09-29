import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';

const CHANNEL = 'toffee_realtime';

/**
 * 앱에 "이 채팅방이 바뀌었어요"만 알리는 신호 — 내용은 싣지 않음(앱이 받으면 평소 API로 다시 불러옴).
 * - artist-message: 스타가 새 메시지를 보냄 → 그 배우 구독 팬·스타·소속사
 * - message-removed: 스타가 지웠거나 운영자가 가림 → 같은 대상
 * - fan-reply: 팬 답장 → 스타·소속사만(팬 답장은 다른 팬에게 안 보임)
 */
export interface RealtimeEvent {
  kind: 'artist-message' | 'message-removed' | 'fan-reply';
  actorId: string;
  /** fan-reply: 답장이 달린 스타 메시지 */
  messageId?: string;
}

/**
 * 서버가 여러 대여도 모든 서버가 같은 신호를 받도록 Postgres의 LISTEN/NOTIFY를 씀 — Redis 같은 추가 서비스 없이
 * 어느 호스팅에서나 동작(2026-09-29). 서버마다 DB 연결 하나를 LISTEN 전용으로 열어 두고, 보낼 땐 pg_notify.
 * 이 연결이 끊겨도 앱은 짧은 폴링으로 돌아가므로 기능이 멈추지는 않음(재연결은 자동).
 */
@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly subject = new Subject<RealtimeEvent>();
  readonly events$ = this.subject.asObservable();
  private client: pg.Client | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryDelay = 1000;
  private closed = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    void this.listen();
  }

  async onModuleDestroy() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.subject.complete();
    await this.client?.end().catch(() => {});
  }

  /** 신호 보내기 — 실패해도 원래 작업(메시지 저장 등)은 성공으로 둠(앱은 폴링으로도 받음) */
  async publish(event: RealtimeEvent): Promise<void> {
    try {
      await this.prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(event)})`;
    } catch (error) {
      this.logger.warn(`publish failed: ${(error as Error).message}`);
    }
  }

  private async listen() {
    if (this.closed) return;
    const client = new pg.Client({ connectionString: this.config.getOrThrow<string>('DATABASE_URL') });
    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        this.subject.next(JSON.parse(msg.payload) as RealtimeEvent);
      } catch {
        // 잘못된 신호는 무시
      }
    });
    client.on('error', (error) => {
      this.logger.warn(`listener error: ${error.message}`);
      this.reconnect(client);
    });
    client.on('end', () => this.reconnect(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.client = client;
      this.retryDelay = 1000;
    } catch (error) {
      this.logger.warn(`listener connect failed: ${(error as Error).message}`);
      this.reconnect(client);
    }
  }

  private reconnect(client: pg.Client) {
    if (this.closed || this.retryTimer || (this.client && this.client !== client)) return;
    this.client = null;
    client.removeAllListeners();
    void client.end().catch(() => {});
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.listen();
    }, delay);
  }
}
