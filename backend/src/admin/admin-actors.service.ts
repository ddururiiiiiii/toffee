import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaService } from '../storage/media.service.js';
import { ActorsService } from '../actors/actors.service.js';
import { AdminAgenciesService } from './admin-agencies.service.js';
import { profileImagePrefix, type ProfileImageTarget } from '../storage/media-policy.js';
import { ActorKind, Role } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateActorDto, CreateCoupleDto, UpdateActorDto, UpdateActorImagesDto } from './dto/upsert-actor.dto.js';
import { appError } from '../common/i18n/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { ensureStoreProductIdFree } from '../common/store/store-product.js';
import { escapeLike } from '../common/utils/escape-like.js';
import { PushService } from '../notifications/push.service.js';
import { pushStrings } from '../notifications/push-messages.js';

const ADMIN_ACTOR_SELECT = {
  id: true,
  legalName: true,
  officialProfileImageUrl: true,
  chatDisplayName: true,
  chatProfileImageUrl: true,
  monthlyPriceCents: true,
  storeProductId: true,
  verified: true,
  gender: true,
  kind: true,
  coupleMembers: { select: { member: { select: { id: true, legalName: true, chatDisplayName: true, officialProfileImageUrl: true, chatProfileImageUrl: true, retiredAt: true } } } },
  retiredAt: true,
  createdAt: true,
  agency: { select: { id: true, name: true, logoUrl: true } },
  selfUser: { select: { id: true, displayName: true, email: true } },
  _count: { select: { subscriptions: { where: { cancelledAt: null } } } },
} as const;

type AdminActorRow = Prisma.ActorGetPayload<{ select: typeof ADMIN_ACTOR_SELECT }>;

/**
 * 운영자 배우 관리 — 배우 등록/수정, 프로필 사진, 본인 계정 연결. 소속사 지정(이적)은 이력을 같이 남겨야
 * 해서 AdminAgenciesService.assignActor를 그대로 씀.
 */
@Injectable()
export class AdminActorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly actors: ActorsService,
    private readonly agencies: AdminAgenciesService,
    private readonly audit: AuditService,
    private readonly push: PushService,
  ) {}

  /**
   * 배우 활동 종료/재개(잠정 정책, STATUS 정책 표): 종료하면 둘러보기·검색에서 숨기고 신규 구독을 막음. 이미 구독 중인 팬은
   * 대화를 계속 볼 수 있음. 스토어 결제가 붙으면 스토어 상품 판매도 같이 멈춰야 갱신이 안 됨(운영 절차). 입대도 "종료"로, 전역하면 "재개".
   * 종료하면 그 배우의 방(개인방 + 들어 있는 커플방)을 구독 중인 팬에게 알림 — 결제 후 14일 안이면 구독 관리에서 환불 요청 가능(2026-09-29).
   */
  async setRetired(adminId: string, id: string, retired: boolean) {
    const actor = await this.ensureActor(id);
    const wasRetired = !!actor.retiredAt;
    await this.prisma.actor.update({ where: { id }, data: { retiredAt: retired ? new Date() : null } });
    await this.audit.record(adminId, retired ? 'ACTOR_RETIRE' : 'ACTOR_RESTORE', 'ACTOR', id);
    if (retired && !wasRetired) await this.notifyRetired(id, actor.chatDisplayName);
    return this.findOne(id);
  }

  private async notifyRetired(actorId: string, name: string) {
    const couples = await this.prisma.coupleMember.findMany({ where: { memberId: actorId }, select: { coupleId: true } });
    const subs = await this.prisma.subscription.findMany({
      where: { actorId: { in: [actorId, ...couples.map((couple) => couple.coupleId)] }, cancelledAt: null },
      select: { userId: true },
    });
    const days = Number(process.env.RETIRE_REFUND_DAYS) || 14;
    await this.push.sendToUsers(
      [...new Set(subs.map((sub) => sub.userId))],
      (recipient) => {
        const t = pushStrings(recipient.locale);
        return { title: t.retiredFanTitle(name), body: t.retiredFanBody(days) };
      },
      { type: 'actor-retired', actorId },
    );
  }

  async findAll(query?: string) {
    const rows = await this.prisma.actor.findMany({
      where: query
        ? {
            OR: [
              { legalName: { contains: escapeLike(query), mode: 'insensitive' } },
              { chatDisplayName: { contains: escapeLike(query), mode: 'insensitive' } },
              { agency: { name: { contains: escapeLike(query), mode: 'insensitive' } } },
            ],
          }
        : undefined,
      select: ADMIN_ACTOR_SELECT,
      orderBy: { legalName: 'asc' },
    });
    const last = await this.actors.lastBroadcastMap(rows.map((row) => row.id));
    return Promise.all(rows.map(async (row) => ({ ...(await this.toResponse(row)), lastBroadcastAt: last.get(row.id) ?? null })));
  }

  async findOne(id: string) {
    const row = await this.prisma.actor.findUnique({ where: { id }, select: ADMIN_ACTOR_SELECT });
    if (!row) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
    return this.toResponse(row);
  }

  /**
   * 커플방 만들기(2026-09-29) — 1인 배우 2명 + 공식 이름·방 이름·월 가격(스토어 상품 ID는 나중에). 같은 두 배우의 커플방은
   * 하나만. 공식 사진은 만든 뒤 상세 화면에서(업로드 경로에 방 id가 필요), 대화방 사진·방 이름은 두 멤버 배우가 각자 바꿀 수 있음.
   */
  async createCouple(adminId: string, dto: CreateCoupleDto) {
    const memberIds = [...new Set(dto.memberIds)];
    if (memberIds.length !== 2) throw new BadRequestException(appError('COUPLE_MEMBERS_INVALID'));
    const members = await this.prisma.actor.findMany({ where: { id: { in: memberIds }, kind: ActorKind.SOLO }, select: { id: true } });
    if (members.length !== 2) throw new BadRequestException(appError('COUPLE_MEMBERS_INVALID'));
    const existing = await this.prisma.actor.findFirst({
      where: { kind: ActorKind.COUPLE, AND: memberIds.map((memberId) => ({ coupleMembers: { some: { memberId } } })) },
      select: { id: true },
    });
    if (existing) throw new ConflictException(appError('COUPLE_EXISTS'));
    const couple = await this.prisma.actor.create({
      data: {
        kind: ActorKind.COUPLE,
        legalName: dto.legalName.trim(),
        chatDisplayName: dto.chatDisplayName.trim(),
        monthlyPriceCents: dto.monthlyPriceCents,
        coupleMembers: { create: memberIds.map((memberId) => ({ memberId })) },
      },
      select: { id: true },
    });
    await this.audit.record(adminId, 'COUPLE_CREATE', 'ACTOR', couple.id, { memberIds, monthlyPriceCents: dto.monthlyPriceCents });
    return this.findOne(couple.id);
  }

  async create(dto: CreateActorDto) {
    const actor = await this.prisma.actor.create({
      data: { legalName: dto.legalName.trim(), chatDisplayName: dto.chatDisplayName.trim(), monthlyPriceCents: dto.monthlyPriceCents, gender: dto.gender ?? null },
      select: { id: true },
    });
    if (dto.agencyId) {
      try {
        await this.agencies.assignActor(actor.id, dto.agencyId);
      } catch (error) {
        // 없는 소속사면 반쯤 만들어진 배우를 남기지 않음
        await this.prisma.actor.delete({ where: { id: actor.id } });
        throw error;
      }
    }
    return this.findOne(actor.id);
  }

  async update(adminId: string, id: string, dto: UpdateActorDto) {
    const before = await this.prisma.actor.findUnique({ where: { id }, select: { monthlyPriceCents: true, storeProductId: true, kind: true } });
    if (!before) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
    // 커플방은 성별이 없음(둘러보기 CP 줄로만)
    const gender = before.kind === ActorKind.COUPLE ? undefined : dto.gender;
    await ensureStoreProductIdFree(this.prisma, dto.storeProductId, { actorId: id });
    await this.prisma.actor.update({
      where: { id },
      data: {
        legalName: dto.legalName?.trim(),
        chatDisplayName: dto.chatDisplayName?.trim(),
        monthlyPriceCents: dto.monthlyPriceCents,
        verified: dto.verified,
        gender,
        storeProductId: dto.storeProductId,
      },
    });
    // 가격·스토어 상품은 돈과 직결 — 바뀌면 운영자 작업 기록에
    const priceChanged = dto.monthlyPriceCents !== undefined && dto.monthlyPriceCents !== before.monthlyPriceCents;
    const productChanged = dto.storeProductId !== undefined && dto.storeProductId !== before.storeProductId;
    if (priceChanged || productChanged) {
      await this.audit.record(adminId, 'ACTOR_PRICE', 'ACTOR', id, {
        from: { monthlyPriceCents: before.monthlyPriceCents, storeProductId: before.storeProductId },
        to: { monthlyPriceCents: dto.monthlyPriceCents ?? before.monthlyPriceCents, storeProductId: dto.storeProductId === undefined ? before.storeProductId : dto.storeProductId },
      });
    }
    return this.findOne(id);
  }

  async updateImages(id: string, dto: UpdateActorImagesDto) {
    await this.actors.updateImages(id, { official: dto.officialProfileImageKey, chat: dto.chatProfileImageKey });
    return this.findOne(id);
  }

  // 배우 본인 계정 연결 — 이 계정이 스튜디오에서 메시지를 보내게 됨. 한 계정은 배우 한 명에만 연결
  async linkUser(id: string, userId: string | null) {
    await this.ensureActor(id);
    const room = await this.prisma.actor.findUniqueOrThrow({ where: { id }, select: { kind: true } });
    // 커플방은 본인 계정이 없음 — 멤버 배우 각자의 본인 계정이 커플방에도 보냄
    if (room.kind === ActorKind.COUPLE) throw new BadRequestException(appError('NOT_FOR_COUPLE'));
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!user) throw new NotFoundException(appError('USER_NOT_FOUND'));
      if (user.role !== Role.ACTOR) {
        throw new BadRequestException(appError('ACTOR_LINK_ROLE_REQUIRED'));
      }
      const other = await this.prisma.actor.findUnique({ where: { selfUserId: userId }, select: { id: true } });
      if (other && other.id !== id) throw new ConflictException(appError('ACCOUNT_ALREADY_LINKED'));
    }
    await this.prisma.actor.update({ where: { id }, data: { selfUserId: userId } });
    return this.findOne(id);
  }

  // 업로드 발급 — 배우 사진은 배우, 소속사 로고는 소속사가 실제로 있어야 함
  async createProfileUpload(target: ProfileImageTarget, targetId: string, contentType: string, sizeBytes: number) {
    if (target === 'ACTOR') {
      await this.ensureActor(targetId);
      return this.actors.createProfileUpload(targetId, contentType, sizeBytes);
    }
    if (!(await this.prisma.agency.findUnique({ where: { id: targetId }, select: { id: true } }))) {
      throw new NotFoundException(appError('AGENCY_NOT_FOUND'));
    }
    return this.media.createUploadAt(profileImagePrefix(target, targetId), 'PHOTO', contentType, sizeBytes);
  }

  private async ensureActor(id: string) {
    const actor = await this.prisma.actor.findUnique({ where: { id }, select: { id: true, retiredAt: true, chatDisplayName: true } });
    if (!actor) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
    return actor;
  }

  private async toResponse({ _count, ...row }: AdminActorRow) {
    return { ...(await this.actors.withImageUrls(row)), activeSubscriberCount: _count.subscriptions };
  }
}
