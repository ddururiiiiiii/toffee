import { Controller, Header, MessageEvent, Sse } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role } from '../generated/prisma/enums.js';
import { viewableActorsWhere } from '../common/authorization/actor-access.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { RealtimeService, type RealtimeEvent } from './realtime.service.js';

// 연결을 유지하려고 보내는 빈 신호 간격(중간 프록시가 조용한 연결을 끊지 않게)
const HEARTBEAT_MS = 25_000;
// 볼 수 있는 배우 목록 안전 새로고침 간격 — 구독이 바뀌면 access-changed 신호로 바로 다시 읽으므로 이건 역할·소속 변경 같은
// 드문 경우용. 예전엔 1분마다라 연결 3,000개면 DB 조회가 끊임없었음(2026-09-29 부하 테스트). 연결마다 시점을 흩뜨림
const AUDIENCE_REFRESH_MS = 10 * 60_000;

interface Audience {
  admin: boolean;
  /** 구독 중인 배우(팬) */
  subscribed: Set<string>;
  /** 배우 본인·소속사 직원으로 볼 수 있는 배우 */
  staff: Set<string>;
}

@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 앱이 로그인한 동안 열어 두는 연결(SSE) — 이 계정이 볼 수 있는 채팅방의 변경 신호만 흘려보냄.
   * 한 번 연결에 요청 하나라 요청 횟수 제한에서는 뺌.
   */
  @SkipThrottle()
  @Sse()
  @Header('X-Accel-Buffering', 'no')
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let audience: Audience | null = null;
      const refresh = () =>
        this.loadAudience(user.id)
          .then((next) => {
            audience = next;
          })
          .catch(() => {});
      // 볼 수 있는 방 목록을 다 읽은 뒤에 "준비됨" — 예전엔 먼저 보내서, 읽는 사이에 온 신호가 조용히 버려질 수 있었음
      void refresh().then(() => {
        if (!subscriber.closed) subscriber.next({ type: 'ready', data: '' });
      });
      const refreshTimer = setInterval(() => void refresh(), AUDIENCE_REFRESH_MS + Math.floor(Math.random() * 60_000));
      const heartbeat = setInterval(() => subscriber.next({ type: 'ping', data: '' }), HEARTBEAT_MS);
      const subscription = this.realtime.events$.subscribe({
        next: (event) => {
          if (event.kind === 'access-changed') {
            // 내 구독이 바뀜 — 방 목록을 다시 읽고 앱에도 알려 줌(인박스·구독 관리 새로고침)
            if (event.userId === user.id) void refresh().then(() => subscriber.next({ type: 'change', data: event }));
            return;
          }
          if (audience && canReceive(audience, event)) subscriber.next({ type: 'change', data: event });
        },
        // 서버가 꺼질 때(배포·재시작) 연결을 닫아 줌 — 앱은 알아서 다른 서버로 다시 연결
        complete: () => subscriber.complete(),
      });
      return () => {
        clearInterval(refreshTimer);
        clearInterval(heartbeat);
        subscription.unsubscribe();
      };
    });
  }

  private async loadAudience(userId: string): Promise<Audience> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, role: true, agencyId: true } });
    if (user.role === Role.ADMIN) return { admin: true, subscribed: new Set(), staff: new Set() };
    const [subscriptions, actors] = await Promise.all([
      this.prisma.subscription.findMany({ where: { userId, cancelledAt: null }, select: { actorId: true } }),
      user.role === Role.ACTOR || user.role === Role.AGENCY_STAFF
        ? this.prisma.actor.findMany({ where: viewableActorsWhere(user), select: { id: true } })
        : Promise.resolve([]),
    ]);
    return {
      admin: false,
      subscribed: new Set(subscriptions.map((sub) => sub.actorId)),
      staff: new Set(actors.map((actor) => actor.id)),
    };
  }
}

export function canReceive(audience: Audience, event: RealtimeEvent): boolean {
  if (!event.actorId) return false;
  if (audience.admin || audience.staff.has(event.actorId)) return true;
  return event.kind !== 'fan-reply' && audience.subscribed.has(event.actorId);
}
