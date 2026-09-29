import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaService } from '../storage/media.service.js';
import { ActorsService } from '../actors/actors.service.js';
import { AdminAgenciesService } from './admin-agencies.service.js';
import { profileImagePrefix, type ProfileImageTarget } from '../storage/media-policy.js';
import { Role } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateActorDto, UpdateActorDto, UpdateActorImagesDto } from './dto/upsert-actor.dto.js';
import { appError } from '../common/i18n/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { ensureStoreProductIdFree } from '../common/store/store-product.js';

const ADMIN_ACTOR_SELECT = {
  id: true,
  legalName: true,
  officialProfileImageUrl: true,
  chatDisplayName: true,
  chatProfileImageUrl: true,
  monthlyPriceCents: true,
  storeProductId: true,
  verified: true,
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
  ) {}

  /**
   * 배우 활동 종료/재개(잠정 정책, STATUS 정책 표): 종료하면 둘러보기·검색에서 숨기고 신규 구독을 막음. 이미 구독 중인 팬은
   * 대화를 계속 볼 수 있음. 스토어 결제가 붙으면 스토어 상품 판매도 같이 멈춰야 갱신이 안 됨(운영 절차).
   */
  async setRetired(adminId: string, id: string, retired: boolean) {
    await this.ensureActor(id);
    await this.prisma.actor.update({ where: { id }, data: { retiredAt: retired ? new Date() : null } });
    await this.audit.record(adminId, retired ? 'ACTOR_RETIRE' : 'ACTOR_RESTORE', 'ACTOR', id);
    return this.findOne(id);
  }

  async findAll(query?: string) {
    const rows = await this.prisma.actor.findMany({
      where: query
        ? {
            OR: [
              { legalName: { contains: query, mode: 'insensitive' } },
              { chatDisplayName: { contains: query, mode: 'insensitive' } },
              { agency: { name: { contains: query, mode: 'insensitive' } } },
            ],
          }
        : undefined,
      select: ADMIN_ACTOR_SELECT,
      orderBy: { legalName: 'asc' },
    });
    return Promise.all(rows.map((row) => this.toResponse(row)));
  }

  async findOne(id: string) {
    const row = await this.prisma.actor.findUnique({ where: { id }, select: ADMIN_ACTOR_SELECT });
    if (!row) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
    return this.toResponse(row);
  }

  async create(dto: CreateActorDto) {
    const actor = await this.prisma.actor.create({
      data: { legalName: dto.legalName.trim(), chatDisplayName: dto.chatDisplayName.trim(), monthlyPriceCents: dto.monthlyPriceCents },
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
    const before = await this.prisma.actor.findUnique({ where: { id }, select: { monthlyPriceCents: true, storeProductId: true } });
    if (!before) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
    await ensureStoreProductIdFree(this.prisma, dto.storeProductId, { actorId: id });
    await this.prisma.actor.update({
      where: { id },
      data: {
        legalName: dto.legalName?.trim(),
        chatDisplayName: dto.chatDisplayName?.trim(),
        monthlyPriceCents: dto.monthlyPriceCents,
        verified: dto.verified,
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
    const actor = await this.prisma.actor.findUnique({ where: { id }, select: { id: true } });
    if (!actor) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
  }

  private async toResponse({ _count, ...row }: AdminActorRow) {
    return { ...(await this.actors.withImageUrls(row)), activeSubscriberCount: _count.subscriptions };
  }
}
