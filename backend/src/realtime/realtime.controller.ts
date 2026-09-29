import { Controller, Header, MessageEvent, Sse } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role } from '../generated/prisma/enums.js';
import { viewableActorsWhere } from '../common/authorization/actor-access.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { RealtimeService, type RealtimeEvent } from './realtime.service.js';

// 연결을 유지하려고 보내는 빈 신호 간격(중간 프록시가 조용한 연결을 끊지 않게), 볼 수 있는 배우 목록을 다시 읽는 간격
const HEARTBEAT_MS = 25_000;
const AUDIENCE_REFRESH_MS = 60_000;

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
      void refresh();
      const refreshTimer = setInterval(() => void refresh(), AUDIENCE_REFRESH_MS);
      const heartbeat = setInterval(() => subscriber.next({ type: 'ping', data: '' }), HEARTBEAT_MS);
      subscriber.next({ type: 'ready', data: '' });
      const subscription = this.realtime.events$.subscribe((event) => {
        if (audience && canReceive(audience, event)) subscriber.next({ type: 'change', data: event });
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
  if (audience.admin || audience.staff.has(event.actorId)) return true;
  return event.kind !== 'fan-reply' && audience.subscribed.has(event.actorId);
}
