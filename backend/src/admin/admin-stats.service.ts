import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MessageSenderType, ReportStatus, Role, SubscriptionEventType } from '../generated/prisma/enums.js';

// 통계의 "하루"는 태국 시간 기준(주 시장) — 날짜 경계를 서버 시간대에 맡기지 않음
const STATS_TIME_ZONE = 'Asia/Bangkok';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 태국 시간 기준 오늘 0시(UTC Date) */
function startOfTodayInZone(now = new Date()): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now)
    .split('-')
    .map(Number);
  // Asia/Bangkok은 서머타임 없이 UTC+7 고정
  return new Date(Date.UTC(y, m - 1, d) - 7 * 60 * 60 * 1000);
}

// 팬 통계는 실제 팬 계정만(배우·소속사·운영자, 탈퇴 계정 제외)
const FAN_WHERE = { role: Role.USER, deletedAt: null } as const;

type DailyRow = { day: string; count: bigint; sum?: bigint | null };

/**
 * 운영자 통계(2026-09-28, 2차 대시보드) — 앱은 summary 숫자만, 웹은 daily/breakdown 그래프까지.
 * 에러 추이는 Sentry 화면에서 봄(키 발급 후 연동, ops-infra-backlog).
 */
@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const today = startOfTodayInZone();
    const d7 = new Date(today.getTime() - 6 * DAY_MS);
    const d30 = new Date(today.getTime() - 29 * DAY_MS);
    const [fans, newToday, new7d, activeToday, active30d, activeSubs, subscribedFans, startedToday, cancelledToday, started30d, cancelled30d, pendingReports, starToday, repliesToday] =
      await Promise.all([
        this.prisma.user.count({ where: FAN_WHERE }),
        this.prisma.user.count({ where: { ...FAN_WHERE, createdAt: { gte: today } } }),
        this.prisma.user.count({ where: { ...FAN_WHERE, createdAt: { gte: d7 } } }),
        this.prisma.user.count({ where: { ...FAN_WHERE, lastActiveAt: { gte: today } } }),
        this.prisma.user.count({ where: { ...FAN_WHERE, lastActiveAt: { gte: d30 } } }),
        this.prisma.subscription.count({ where: { cancelledAt: null, user: FAN_WHERE } }),
        this.prisma.user.count({ where: { ...FAN_WHERE, subscriptions: { some: { cancelledAt: null } } } }),
        this.prisma.subscriptionEvent.count({ where: { type: SubscriptionEventType.STARTED, createdAt: { gte: today } } }),
        this.prisma.subscriptionEvent.count({ where: { type: SubscriptionEventType.CANCELLED, createdAt: { gte: today } } }),
        this.prisma.subscriptionEvent.count({ where: { type: SubscriptionEventType.STARTED, createdAt: { gte: d30 } } }),
        this.prisma.subscriptionEvent.count({ where: { type: SubscriptionEventType.CANCELLED, createdAt: { gte: d30 } } }),
        this.prisma.report.count({ where: { status: ReportStatus.PENDING } }),
        this.prisma.message.count({ where: { senderType: MessageSenderType.ARTIST, createdAt: { gte: today } } }),
        this.prisma.message.count({ where: { senderType: MessageSenderType.FAN, createdAt: { gte: today } } }),
      ]);
    return {
      timeZone: STATS_TIME_ZONE,
      fans: { total: fans, newToday, new7d, activeToday, active30d },
      subscriptions: {
        active: activeSubs,
        subscribedFans,
        // 구독률 = 구독 중인 팬 / 전체 팬
        subscriptionRate: fans ? subscribedFans / fans : 0,
        startedToday,
        cancelledToday,
        started30d,
        cancelled30d,
      },
      reports: { pending: pendingReports },
      messages: { starToday, fanRepliesToday: repliesToday },
    };
  }

  /** 최근 N일(태국 날짜) 일별 추이 — 가입, 구독 시작·해지, 신규 구독 매출(적용 가격 합), 스타 메시지, 팬 답장 */
  async daily(days: number) {
    const from = new Date(startOfTodayInZone().getTime() - (days - 1) * DAY_MS);
    const dayExpr = (column: string) => `to_char(("${column}" AT TIME ZONE 'UTC') AT TIME ZONE '${STATS_TIME_ZONE}', 'YYYY-MM-DD')`;
    const [signups, started, cancelled, starMessages, fanReplies] = await Promise.all([
      this.prisma.$queryRawUnsafe<DailyRow[]>(
        `SELECT ${dayExpr('createdAt')} AS day, count(*) AS count FROM "User"
         WHERE "createdAt" >= $1 AND role = 'USER' AND "deletedAt" IS NULL GROUP BY 1`,
        from,
      ),
      this.prisma.$queryRawUnsafe<DailyRow[]>(
        `SELECT ${dayExpr('createdAt')} AS day, count(*) AS count, sum("priceCents") AS sum FROM "SubscriptionEvent"
         WHERE "createdAt" >= $1 AND type = 'STARTED' GROUP BY 1`,
        from,
      ),
      this.prisma.$queryRawUnsafe<DailyRow[]>(
        `SELECT ${dayExpr('createdAt')} AS day, count(*) AS count FROM "SubscriptionEvent"
         WHERE "createdAt" >= $1 AND type = 'CANCELLED' GROUP BY 1`,
        from,
      ),
      this.prisma.$queryRawUnsafe<DailyRow[]>(
        `SELECT ${dayExpr('createdAt')} AS day, count(*) AS count FROM "Message"
         WHERE "createdAt" >= $1 AND "senderType" = 'ARTIST' GROUP BY 1`,
        from,
      ),
      this.prisma.$queryRawUnsafe<DailyRow[]>(
        `SELECT ${dayExpr('createdAt')} AS day, count(*) AS count FROM "Message"
         WHERE "createdAt" >= $1 AND "senderType" = 'FAN' GROUP BY 1`,
        from,
      ),
    ]);
    const index = (rows: DailyRow[], pick: (row: DailyRow) => number) => new Map(rows.map((row) => [row.day, pick(row)]));
    const maps = {
      signups: index(signups, (r) => Number(r.count)),
      subscriptionsStarted: index(started, (r) => Number(r.count)),
      subscriptionsCancelled: index(cancelled, (r) => Number(r.count)),
      newRevenueCents: index(started, (r) => Number(r.sum ?? 0)),
      starMessages: index(starMessages, (r) => Number(r.count)),
      fanReplies: index(fanReplies, (r) => Number(r.count)),
    };
    return Array.from({ length: days }, (_, i) => {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TIME_ZONE }).format(new Date(from.getTime() + i * DAY_MS + 12 * 60 * 60 * 1000));
      return {
        day,
        signups: maps.signups.get(day) ?? 0,
        subscriptionsStarted: maps.subscriptionsStarted.get(day) ?? 0,
        subscriptionsCancelled: maps.subscriptionsCancelled.get(day) ?? 0,
        newRevenueCents: maps.newRevenueCents.get(day) ?? 0,
        starMessages: maps.starMessages.get(day) ?? 0,
        fanReplies: maps.fanReplies.get(day) ?? 0,
      };
    });
  }

  /** 분포 — 국가·가입 기기·가입 경로(첫 소셜 로그인 종류)·언어, 배우별 구독 */
  async breakdown() {
    const d30 = new Date(startOfTodayInZone().getTime() - 29 * DAY_MS);
    const [byCountry, byPlatform, byLocale, byProvider, actors] = await Promise.all([
      this.prisma.user.groupBy({ by: ['countryCode'], where: FAN_WHERE, _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['signupPlatform'], where: FAN_WHERE, _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['locale'], where: FAN_WHERE, _count: { _all: true } }),
      this.prisma.$queryRawUnsafe<{ provider: string; count: bigint }[]>(
        `SELECT first.provider::text AS provider, count(*) AS count FROM (
           SELECT DISTINCT ON (a."userId") a."userId", a.provider FROM "AuthIdentity" a
           JOIN "User" u ON u.id = a."userId" WHERE u.role = 'USER' AND u."deletedAt" IS NULL
           ORDER BY a."userId", a."createdAt"
         ) first GROUP BY 1`,
      ),
      this.prisma.actor.findMany({
        select: {
          id: true,
          legalName: true,
          chatDisplayName: true,
          _count: { select: { subscriptions: { where: { cancelledAt: null } } } },
          subscriptionEvents: { where: { createdAt: { gte: d30 } }, select: { type: true, priceCents: true } },
        },
      }),
    ]);
    const sorted = (rows: { key: string | null; count: number }[]) =>
      rows.map((row) => ({ key: row.key ?? 'unknown', count: row.count })).sort((a, b) => b.count - a.count);
    return {
      countries: sorted(byCountry.map((r) => ({ key: r.countryCode, count: r._count._all }))),
      platforms: sorted(byPlatform.map((r) => ({ key: r.signupPlatform, count: r._count._all }))),
      locales: sorted(byLocale.map((r) => ({ key: r.locale, count: r._count._all }))),
      // 소셜 로그인 없이 만든 계정(개발용 이메일 로그인)은 여기 안 잡힘
      providers: sorted(byProvider.map((r) => ({ key: r.provider, count: Number(r.count) }))),
      actors: actors
        .map((actor) => ({
          id: actor.id,
          name: actor.legalName,
          nickname: actor.chatDisplayName,
          activeSubscribers: actor._count.subscriptions,
          started30d: actor.subscriptionEvents.filter((e) => e.type === SubscriptionEventType.STARTED).length,
          cancelled30d: actor.subscriptionEvents.filter((e) => e.type === SubscriptionEventType.CANCELLED).length,
          newRevenue30dCents: actor.subscriptionEvents.reduce((sum, e) => sum + (e.priceCents ?? 0), 0),
        }))
        .sort((a, b) => b.activeSubscribers - a.activeSubscribers),
    };
  }
}
