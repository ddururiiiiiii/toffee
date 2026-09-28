import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaService } from '../storage/media.service.js';
import { appError } from '../common/i18n/app-error.js';

// 팬 공개용 — 소속사 목록(소속사별 배우 탐색 진입점). 소속 배우 목록 자체는
// GET /actors?agencyId=... 로 가져옴(검색/정렬 로직을 한 군데에 두기 위해)
const AGENCY_SELECT = {
  id: true,
  name: true,
  logoUrl: true,
  _count: { select: { actors: true } },
} as const;

@Injectable()
export class AgenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async findAll(query?: string) {
    const agencies = await this.prisma.agency.findMany({
      where: query ? { name: { contains: query, mode: 'insensitive' } } : undefined,
      select: AGENCY_SELECT,
      orderBy: { name: 'asc' },
    });
    return Promise.all(agencies.map((agency) => this.toResponse(agency)));
  }

  async findOne(id: string) {
    const agency = await this.prisma.agency.findUnique({ where: { id }, select: AGENCY_SELECT });
    if (!agency) throw new NotFoundException(appError('AGENCY_NOT_FOUND'));
    return this.toResponse(agency);
  }

  private async toResponse({ _count, ...agency }: { id: string; name: string; logoUrl: string | null; _count: { actors: number } }) {
    return { ...agency, logoUrl: await this.media.resolveImageUrl(agency.logoUrl), actorCount: _count.actors };
  }
}

