import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActorKind, Role } from '../generated/prisma/enums.js';
import type { CreateAgencyDto, UpdateAgencyDto } from './dto/upsert-agency.dto.js';
import { MediaService } from '../storage/media.service.js';
import { isStorageKey, profileImagePrefix } from '../storage/media-policy.js';
import { appError } from '../common/i18n/app-error.js';
import { AuditService } from '../audit/audit.service.js';

const ADMIN_AGENCY_SELECT = {
  id: true,
  name: true,
  logoUrl: true,
  revenueSharePercent: true,
  createdAt: true,
  _count: { select: { actors: true, staff: true } },
} as const;

@Injectable()
export class AdminAgenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  // 운영자용 목록 — 팬 공개 목록(GET /agencies)과 달리 스태프 수까지
  async findAll() {
    const agencies = await this.prisma.agency.findMany({ select: ADMIN_AGENCY_SELECT, orderBy: { name: 'asc' } });
    return Promise.all(agencies.map((agency) => this.toResponse(agency)));
  }

  // 로고는 소속사가 생긴 뒤에 올릴 수 있음(업로드 경로에 소속사 id가 들어감) — 만들 땐 외부 주소만
  async create(dto: CreateAgencyDto) {
    if (isStorageKey(dto.logoUrl)) throw new BadRequestException(appError('AGENCY_LOGO_AFTER_CREATE'));
    await this.ensureNameAvailable(dto.name.trim());
    const agency = await this.prisma.agency.create({
      data: { name: dto.name.trim(), logoUrl: dto.logoUrl ?? null },
      select: ADMIN_AGENCY_SELECT,
    });
    return this.toResponse(agency);
  }

  // logoUrl: POST /admin/uploads(target AGENCY)로 받은 키, 외부 주소, 또는 null(삭제)
  async update(adminId: string, id: string, dto: UpdateAgencyDto) {
    const existing = await this.prisma.agency.findUnique({ where: { id }, select: { logoUrl: true, revenueSharePercent: true } });
    if (!existing) throw new NotFoundException(appError('AGENCY_NOT_FOUND'));
    const name = dto.name?.trim();
    if (name !== undefined) await this.ensureNameAvailable(name, id);
    if (isStorageKey(dto.logoUrl) && dto.logoUrl !== existing.logoUrl) {
      await this.media.verifyAt(profileImagePrefix('AGENCY', id), 'PHOTO', dto.logoUrl);
    }
    const agency = await this.prisma.agency.update({ where: { id }, data: { name, logoUrl: dto.logoUrl, revenueSharePercent: dto.revenueSharePercent }, select: ADMIN_AGENCY_SELECT });
    // 정산 비율은 돈과 직결 — 누가 언제 바꿨는지 기록
    if (dto.revenueSharePercent !== undefined && dto.revenueSharePercent !== existing.revenueSharePercent) {
      await this.audit.record(adminId, 'AGENCY_SHARE', 'AGENCY', id, { from: existing.revenueSharePercent, to: dto.revenueSharePercent });
    }
    if (dto.logoUrl !== undefined && dto.logoUrl !== existing.logoUrl && isStorageKey(existing.logoUrl)) {
      await this.media.deleteQuietly(existing.logoUrl);
    }
    return this.toResponse(agency);
  }

  private async toResponse({ _count, ...agency }: { id: string; name: string; logoUrl: string | null; revenueSharePercent: number | null; createdAt: Date; _count: { actors: number; staff: number } }) {
    return { ...agency, logoUrl: await this.media.resolveImageUrl(agency.logoUrl), actorCount: _count.actors, staffCount: _count.staff };
  }

  // 배우 소속 변경(이적/무소속 전환) — Actor.agencyId와 ActorAgencyHistory를 반드시 한 트랜잭션에서
  // 같이 바꿈. 이력은 정산(이적 시점 기준 매출 귀속)·계약 분쟁 대응용 기록이고, 모니터링 권한은
  // 현재 소속(Actor.agencyId)으로만 판단함.
  async assignActor(actorId: string, agencyId: string | null) {
    if (agencyId) await this.findAgencyOrThrow(agencyId);

    return this.prisma.$transaction(async (tx) => {
      const actor = await tx.actor.findUnique({ where: { id: actorId }, select: { agencyId: true, kind: true } });
      if (!actor) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
      // 커플방은 소속사가 없음 — 멤버 배우의 소속사가 각자 모니터링
      if (actor.kind === ActorKind.COUPLE) throw new BadRequestException(appError('NOT_FOR_COUPLE'));
      if (actor.agencyId === agencyId) return this.actorWithAgency(tx, actorId);

      const now = new Date();
      await tx.actorAgencyHistory.updateMany({ where: { actorId, endedAt: null }, data: { endedAt: now } });
      if (agencyId) await tx.actorAgencyHistory.create({ data: { actorId, agencyId, startedAt: now } });
      await tx.actor.update({ where: { id: actorId }, data: { agencyId } });
      return this.actorWithAgency(tx, actorId);
    });
  }

  async actorHistory(actorId: string) {
    const actor = await this.prisma.actor.findUnique({ where: { id: actorId }, select: { id: true } });
    if (!actor) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
    return this.prisma.actorAgencyHistory.findMany({
      where: { actorId },
      select: { id: true, startedAt: true, endedAt: true, agency: { select: { id: true, name: true } } },
      orderBy: { startedAt: 'desc' },
    });
  }

  // 스태프 계정의 소속사 지정 — 같은 소속사 배우 전원을 모니터링하게 됨(직원별 담당 배우 구분 없음)
  async assignStaff(userId: string, agencyId: string | null) {
    if (agencyId) await this.findAgencyOrThrow(agencyId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) throw new NotFoundException(appError('USER_NOT_FOUND'));
    if (agencyId && user.role !== Role.AGENCY_STAFF) {
      throw new BadRequestException(appError('AGENCY_STAFF_ROLE_REQUIRED'));
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { agencyId },
      select: { id: true, displayName: true, role: true, agency: { select: { id: true, name: true } } },
    });
  }

  private actorWithAgency(tx: Pick<PrismaService, 'actor'>, actorId: string) {
    return tx.actor.findUniqueOrThrow({
      where: { id: actorId },
      select: { id: true, legalName: true, agency: { select: { id: true, name: true, logoUrl: true } } },
    });
  }

  private async findAgencyOrThrow(id: string) {
    const agency = await this.prisma.agency.findUnique({ where: { id }, select: { id: true } });
    if (!agency) throw new NotFoundException(appError('AGENCY_NOT_FOUND'));
    return agency;
  }

  private async ensureNameAvailable(name: string, exceptId?: string) {
    const existing = await this.prisma.agency.findUnique({ where: { name }, select: { id: true } });
    if (existing && existing.id !== exceptId) throw new ConflictException(appError('AGENCY_NAME_TAKEN'));
  }
}
