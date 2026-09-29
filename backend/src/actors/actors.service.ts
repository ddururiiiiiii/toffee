import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isStorageKey, profileImagePrefix } from '../storage/media-policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ensureCanViewActor, ensureIsActorSelf, viewableActorsWhere } from '../common/authorization/actor-access.js';
import { normalizeNickname } from '../common/nickname/nickname.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { ActorKind, MessageSenderType, Role } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MediaService } from '../storage/media.service.js';
import { appError } from '../common/i18n/app-error.js';

// legalName/officialProfileImageUrl는 탐색 화면(공식 프로필, 운영자가 관리)에, chatDisplayName(배우가 직접 정하는
// 닉네임)/chatProfileImageUrl는 채팅방 안에서 씀 — 어느 쪽을 보여줄지는 클라이언트가 화면 맥락에 맞게 고름
const LIST_SELECT = {
  id: true,
  legalName: true,
  officialProfileImageUrl: true,
  chatDisplayName: true,
  chatProfileImageUrl: true,
  monthlyPriceCents: true,
  // 개인 구독 스토어 상품 ID(없으면 아직 스토어 결제 불가 — 앱은 테스트 구독만)
  storeProductId: true,
  // Discover의 "NEW" 표시용
  createdAt: true,
  retiredAt: true,
  // 소속사는 팬에게도 공개(소속사별 목록/검색) — 무소속이면 null
  agency: { select: { id: true, name: true, logoUrl: true } },
  // 1인 방(SOLO) / 커플방(COUPLE, 2026-09-29) — 커플방이면 멤버 배우 2명
  kind: true,
  coupleMembers: {
    select: {
      member: { select: { id: true, legalName: true, chatDisplayName: true, officialProfileImageUrl: true, chatProfileImageUrl: true, retiredAt: true } },
    },
  },
} as const;

// 커플방 중 멤버 배우가 활동 종료한 방은 팬 목록에서 숨김(방 자체의 retiredAt과 같은 취급)
const NO_RETIRED_MEMBER: Prisma.ActorWhereInput = { coupleMembers: { none: { member: { retiredAt: { not: null } } } } };

@Injectable()
export class ActorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly moderation: ModerationService,
  ) {}

  // q는 배우 이름뿐 아니라 소속사 이름에도 매칭 — "GMMTV"로 검색하면 소속 배우가 다 나오게
  async findAll(query?: string, agencyId?: string, sort?: 'trending' | 'new', kind: ActorKind = ActorKind.SOLO) {
    // 활동 종료한 배우는 둘러보기·검색에서 숨김(프로필 링크로 들어오면 "활동 종료" 안내). 기본은 1인 배우만 —
    // 커플방은 kind=COUPLE로 따로(둘러보기의 커플방 줄)
    const where: Prisma.ActorWhereInput = { retiredAt: null, kind, ...NO_RETIRED_MEMBER };
    if (agencyId) where.agencyId = agencyId;
    if (query) {
      where.OR = [
        { legalName: { contains: query, mode: 'insensitive' } },
        { agency: { name: { contains: query, mode: 'insensitive' } } },
      ];
    }
    const actors = await this.prisma.actor.findMany({
      where,
      select: LIST_SELECT,
      orderBy:
        sort === 'trending'
          ? [{ subscriptions: { _count: 'desc' } }, { legalName: 'asc' }]
          : sort === 'new'
            ? [{ createdAt: 'desc' }]
            : { legalName: 'asc' },
    });
    return Promise.all(actors.map((actor) => this.withImageUrls(actor)));
  }

  /** 이 배우가 멤버인 커플방(배우 프로필의 "커플방") — 활동 중인 것만 */
  async couplesOf(actorId: string) {
    const rows = await this.prisma.actor.findMany({
      where: { kind: ActorKind.COUPLE, retiredAt: null, coupleMembers: { some: { memberId: actorId } }, ...NO_RETIRED_MEMBER },
      select: LIST_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(rows.map((row) => this.withImageUrls(row)));
  }

  async findOne(id: string) {
    const actor = await this.prisma.actor.findUnique({ where: { id }, select: LIST_SELECT });
    if (!actor) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
    return this.withImageUrls(actor);
  }

  // 콘솔 진입점 — 스태프는 자기 소속사 배우 전원, 배우 본인은 자기 자신, ADMIN은 전체
  async findMine(userId: string) {
    const requester = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const actors = await this.prisma.actor.findMany({
      where: requester.role === Role.ADMIN ? undefined : viewableActorsWhere(requester),
      select: LIST_SELECT,
      orderBy: { legalName: 'asc' },
    });
    return Promise.all(actors.map((actor) => this.withImageUrls(actor)));
  }

  async getStats(userId: string, actorId: string) {
    await ensureCanViewActor(this.prisma, userId, actorId);
    const [subscriberCount, lastBroadcast] = await Promise.all([
      this.prisma.subscription.count({ where: { actorId, cancelledAt: null } }),
      this.prisma.message.findFirst({
        where: { actorId, senderType: MessageSenderType.ARTIST },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    return { subscriberCount, lastBroadcastAt: lastBroadcast?.createdAt ?? null };
  }

  // 이미지 필드에 저장소 키가 들어 있으면 임시 조회 URL로 바꿔서 내려줌(MediaService.resolveImageUrl)
  async withImageUrls<
    T extends {
      officialProfileImageUrl: string | null;
      chatProfileImageUrl: string | null;
      agency: { logoUrl: string | null } | null;
      coupleMembers?: { member: { officialProfileImageUrl: string | null; chatProfileImageUrl: string | null } }[];
    },
  >(actor: T): Promise<T> {
    const [officialProfileImageUrl, chatProfileImageUrl, logoUrl, coupleMembers] = await Promise.all([
      this.media.resolveImageUrl(actor.officialProfileImageUrl),
      this.media.resolveImageUrl(actor.chatProfileImageUrl),
      this.media.resolveImageUrl(actor.agency?.logoUrl ?? null),
      // 커플방 멤버 사진도 같은 방식으로
      actor.coupleMembers &&
        Promise.all(
          actor.coupleMembers.map(async ({ member }) => ({
            member: {
              ...member,
              officialProfileImageUrl: await this.media.resolveImageUrl(member.officialProfileImageUrl),
              chatProfileImageUrl: await this.media.resolveImageUrl(member.chatProfileImageUrl),
            },
          })),
        ),
    ]);
    return {
      ...actor,
      officialProfileImageUrl,
      chatProfileImageUrl,
      agency: actor.agency && { ...actor.agency, logoUrl },
      ...(coupleMembers ? { coupleMembers } : {}),
    };
  }

  // ── 프로필 사진 ─────────────────────────────────────────
  // 대화방 사진은 배우 본인·소속사 직원도 메신저 프로필처럼 바꿀 수 있음(스키마 주석 참고), 공식 사진은 운영자만
  // (공식 사진·이름은 사칭 방지를 위해 운영자가 확인하는 값). 권한 확인은 호출하는 쪽에서.

  createProfileUpload(actorId: string, contentType: string, sizeBytes: number) {
    return this.media.createUploadAt(profileImagePrefix('ACTOR', actorId), 'PHOTO', contentType, sizeBytes);
  }

  /** 값: 업로드로 받은 키, null(삭제), undefined(그대로). 바뀐 이전 파일은 다른 칸에서 안 쓰면 지움 */
  async updateImages(actorId: string, changes: { official?: string | null; chat?: string | null }) {
    const actor = await this.prisma.actor.findUnique({
      where: { id: actorId },
      select: { officialProfileImageUrl: true, chatProfileImageUrl: true },
    });
    if (!actor) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));

    const data: Prisma.ActorUpdateInput = {};
    const replaced: (string | null)[] = [];
    if (changes.official !== undefined) {
      data.officialProfileImageUrl = await this.checkImageKey(actorId, changes.official);
      replaced.push(actor.officialProfileImageUrl);
    }
    if (changes.chat !== undefined) {
      data.chatProfileImageUrl = await this.checkImageKey(actorId, changes.chat);
      replaced.push(actor.chatProfileImageUrl);
    }
    const updated = await this.prisma.actor.update({
      where: { id: actorId },
      data,
      select: { officialProfileImageUrl: true, chatProfileImageUrl: true },
    });
    const stillUsed = new Set([updated.officialProfileImageUrl, updated.chatProfileImageUrl]);
    for (const old of replaced) {
      if (isStorageKey(old) && !stillUsed.has(old)) await this.media.deleteQuietly(old);
    }
  }

  private async checkImageKey(actorId: string, key: string | null): Promise<string | null> {
    if (key === null) return null;
    await this.media.verifyAt(profileImagePrefix('ACTOR', actorId), 'PHOTO', key);
    return key;
  }

  /** 배우 본인·소속사 직원의 대화방 사진 변경 */
  async createChatProfileUpload(userId: string, actorId: string, contentType: string, sizeBytes: number) {
    await ensureCanViewActor(this.prisma, userId, actorId);
    return this.createProfileUpload(actorId, contentType, sizeBytes);
  }

  async setChatProfileImage(userId: string, actorId: string, key: string | null) {
    await ensureCanViewActor(this.prisma, userId, actorId);
    await this.updateImages(actorId, { chat: key });
    return this.findOne(actorId);
  }

  /**
   * 배우 닉네임(= 채팅방에 보이는 이름, 컬럼명은 chatDisplayName) — 배우 본인이 자유롭게 바꿈(변경 주기 제한 없음).
   * 팬 닉네임과 같은 기본 규칙(길이·보이지 않는 문자·예약어·금칙어) + 다른 배우와 같은 닉네임 금지(팬 혼동 방지).
   */
  async updateNickname(userId: string, actorId: string, raw: string) {
    await ensureIsActorSelf(this.prisma, userId, actorId);
    const nickname = normalizeNickname(raw);
    await this.moderation.assertNoBannedWords(nickname).catch(() => {
      throw new BadRequestException(appError('NICKNAME_INAPPROPRIATE'));
    });
    const clash = await this.prisma.actor.findFirst({
      where: {
        id: { not: actorId },
        OR: [
          { chatDisplayName: { equals: nickname, mode: 'insensitive' } },
          { legalName: { equals: nickname, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(appError('ACTOR_NAME_TAKEN'));
    await this.prisma.actor.update({ where: { id: actorId }, data: { chatDisplayName: nickname } });
    return this.findOne(actorId);
  }
}
