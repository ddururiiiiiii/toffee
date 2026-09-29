import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaService } from '../storage/media.service.js';
import { AuditService } from '../audit/audit.service.js';
import { appError } from '../common/i18n/app-error.js';
import { ensureStoreProductIdFree } from '../common/store/store-product.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateBundleDto, UpdateBundleDto } from './dto/upsert-bundle.dto.js';

const BUNDLE_SELECT = {
  id: true,
  name: true,
  priceCents: true,
  storeProductId: true,
  active: true,
  createdAt: true,
  actors: {
    select: {
      actor: {
        select: { id: true, legalName: true, chatDisplayName: true, officialProfileImageUrl: true, chatProfileImageUrl: true, monthlyPriceCents: true, retiredAt: true },
      },
    },
  },
} as const;
type BundleRow = Prisma.BundleGetPayload<{ select: typeof BUNDLE_SELECT }>;

/**
 * 묶음 상품(2026-09-29) — 여러 배우 개인방을 할인가로. 팬 화면: 배우 프로필의 "묶음으로 구독하기", 묶음 구독 확인 화면.
 * 운영자: 등록·가격·스토어 상품 ID·판매 중지. 구매·방 열기는 SubscriptionsService.
 */
@Injectable()
export class BundlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  /** 이 배우가 들어 있는 판매 중인 묶음(활동 종료한 배우가 섞인 묶음은 뺌) */
  async forActor(actorId: string) {
    const rows = await this.prisma.bundle.findMany({
      where: { active: true, actors: { some: { actorId } }, NOT: { actors: { some: { actor: { retiredAt: { not: null } } } } } },
      select: BUNDLE_SELECT,
      orderBy: { priceCents: 'asc' },
    });
    return Promise.all(rows.filter((row) => row.actors.length >= 2).map((row) => this.toPublic(row)));
  }

  async findOne(id: string) {
    const row = await this.prisma.bundle.findUnique({ where: { id }, select: BUNDLE_SELECT });
    if (!row) throw new NotFoundException(appError('BUNDLE_NOT_FOUND'));
    return this.toPublic(row);
  }

  // ── 운영자 ──

  async adminList() {
    const rows = await this.prisma.bundle.findMany({ select: BUNDLE_SELECT, orderBy: { createdAt: 'desc' } });
    const counts = await this.activeCounts(rows.map((row) => row.id));
    return Promise.all(rows.map(async (row) => ({ ...(await this.toPublic(row)), activePurchaseCount: counts.get(row.id) ?? 0 })));
  }

  async adminFindOne(id: string) {
    const row = await this.prisma.bundle.findUnique({ where: { id }, select: BUNDLE_SELECT });
    if (!row) throw new NotFoundException(appError('BUNDLE_NOT_FOUND'));
    const counts = await this.activeCounts([id]);
    return { ...(await this.toPublic(row)), activePurchaseCount: counts.get(id) ?? 0 };
  }

  async create(adminId: string, dto: CreateBundleDto) {
    const actorIds = await this.validActorIds(dto.actorIds);
    await ensureStoreProductIdFree(this.prisma, dto.storeProductId, {});
    const bundle = await this.prisma.bundle.create({
      data: {
        name: dto.name.trim(),
        priceCents: dto.priceCents,
        storeProductId: dto.storeProductId ?? null,
        actors: { create: actorIds.map((actorId) => ({ actorId })) },
      },
      select: { id: true },
    });
    await this.audit.record(adminId, 'BUNDLE_CREATE', 'BUNDLE', bundle.id, { name: dto.name, priceCents: dto.priceCents, actorIds, storeProductId: dto.storeProductId ?? null });
    return this.adminFindOne(bundle.id);
  }

  async update(adminId: string, id: string, dto: UpdateBundleDto) {
    const before = await this.prisma.bundle.findUnique({ where: { id }, select: { name: true, priceCents: true, storeProductId: true, active: true } });
    if (!before) throw new NotFoundException(appError('BUNDLE_NOT_FOUND'));
    await ensureStoreProductIdFree(this.prisma, dto.storeProductId, { bundleId: id });
    let actorIds: string[] | undefined;
    if (dto.actorIds) {
      actorIds = await this.validActorIds(dto.actorIds);
      // 이미 산 팬의 방이 갑자기 바뀌면 안 됨 — 구성을 바꾸려면 판매 중지 후 새 묶음으로
      if ((await this.activeCounts([id])).get(id)) throw new ConflictException(appError('BUNDLE_IN_USE'));
    }
    await this.prisma.$transaction([
      this.prisma.bundle.update({
        where: { id },
        data: { name: dto.name?.trim(), priceCents: dto.priceCents, storeProductId: dto.storeProductId, active: dto.active },
      }),
      ...(actorIds
        ? [
            this.prisma.bundleActor.deleteMany({ where: { bundleId: id } }),
            this.prisma.bundleActor.createMany({ data: actorIds.map((actorId) => ({ bundleId: id, actorId })) }),
          ]
        : []),
    ]);
    await this.audit.record(adminId, 'BUNDLE_UPDATE', 'BUNDLE', id, {
      from: before,
      to: { name: dto.name, priceCents: dto.priceCents, storeProductId: dto.storeProductId, active: dto.active, actorIds },
    } as Prisma.InputJsonValue);
    return this.adminFindOne(id);
  }

  private async validActorIds(input: string[]): Promise<string[]> {
    const ids = [...new Set(input)];
    if (ids.length < 2) throw new BadRequestException(appError('BUNDLE_ACTORS_INVALID'));
    const found = await this.prisma.actor.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException(appError('BUNDLE_ACTORS_INVALID'));
    return ids;
  }

  private async activeCounts(bundleIds: string[]) {
    const groups = await this.prisma.purchase.groupBy({
      by: ['bundleId'],
      where: { bundleId: { in: bundleIds }, cancelledAt: null },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.bundleId!, group._count._all]));
  }

  /** 개인 구독으로 따로 살 때 합계(regularPriceCents)도 같이 — 앱이 "N% 할인"을 보여줌 */
  private async toPublic(row: BundleRow) {
    const actors = await Promise.all(
      row.actors.map(async ({ actor }) => ({
        ...actor,
        officialProfileImageUrl: await this.media.resolveImageUrl(actor.officialProfileImageUrl),
        chatProfileImageUrl: await this.media.resolveImageUrl(actor.chatProfileImageUrl),
      })),
    );
    const regularPriceCents = actors.reduce((sum, actor) => sum + actor.monthlyPriceCents, 0);
    return { ...row, actors, regularPriceCents };
  }
}
