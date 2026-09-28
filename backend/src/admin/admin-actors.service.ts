import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaService } from '../storage/media.service.js';
import { ActorsService } from '../actors/actors.service.js';
import { AdminAgenciesService } from './admin-agencies.service.js';
import { isStorageKey, profileImagePrefix, type ProfileImageTarget } from '../storage/media-policy.js';
import { Role } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateActorDto, UpdateActorDto, UpdateActorImagesDto } from './dto/upsert-actor.dto.js';

const ADMIN_ACTOR_SELECT = {
  id: true,
  legalName: true,
  officialProfileImageUrl: true,
  chatDisplayName: true,
  chatProfileImageUrl: true,
  monthlyPriceCents: true,
  verified: true,
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
  ) {}

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
    if (!row) throw new NotFoundException('배우를 찾을 수 없습니다.');
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

  async update(id: string, dto: UpdateActorDto) {
    await this.ensureActor(id);
    await this.prisma.actor.update({
      where: { id },
      data: {
        legalName: dto.legalName?.trim(),
        chatDisplayName: dto.chatDisplayName?.trim(),
        monthlyPriceCents: dto.monthlyPriceCents,
        verified: dto.verified,
      },
    });
    return this.findOne(id);
  }

  async updateImages(id: string, dto: UpdateActorImagesDto) {
    const actor = await this.prisma.actor.findUnique({
      where: { id },
      select: { officialProfileImageUrl: true, chatProfileImageUrl: true },
    });
    if (!actor) throw new NotFoundException('배우를 찾을 수 없습니다.');

    const data: Prisma.ActorUpdateInput = {};
    const replaced: (string | null)[] = [];
    if (dto.officialProfileImageKey !== undefined) {
      data.officialProfileImageUrl = await this.checkImageKey('ACTOR', id, dto.officialProfileImageKey);
      replaced.push(actor.officialProfileImageUrl);
    }
    if (dto.chatProfileImageKey !== undefined) {
      data.chatProfileImageUrl = await this.checkImageKey('ACTOR', id, dto.chatProfileImageKey);
      replaced.push(actor.chatProfileImageUrl);
    }
    const updated = await this.prisma.actor.update({
      where: { id },
      data,
      select: { officialProfileImageUrl: true, chatProfileImageUrl: true },
    });
    // 이전 파일은 이제 어디서도 안 쓰면 지움(공식/대화방 프로필에 같은 파일을 쓰는 경우는 남겨둠)
    const stillUsed = new Set([updated.officialProfileImageUrl, updated.chatProfileImageUrl]);
    for (const old of replaced) {
      if (isStorageKey(old) && !stillUsed.has(old)) await this.media.deleteQuietly(old);
    }
    return this.findOne(id);
  }

  // 배우 본인 계정 연결 — 이 계정이 스튜디오에서 메시지를 보내게 됨. 한 계정은 배우 한 명에만 연결
  async linkUser(id: string, userId: string | null) {
    await this.ensureActor(id);
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
      if (user.role !== Role.ACTOR) {
        throw new BadRequestException('배우(ACTOR) 역할 계정만 연결할 수 있어요 — 회원 관리에서 역할을 먼저 바꿔 주세요.');
      }
      const other = await this.prisma.actor.findUnique({ where: { selfUserId: userId }, select: { id: true } });
      if (other && other.id !== id) throw new ConflictException('이미 다른 배우에 연결된 계정이에요.');
    }
    await this.prisma.actor.update({ where: { id }, data: { selfUserId: userId } });
    return this.findOne(id);
  }

  // 업로드 발급 — 배우 사진은 배우, 소속사 로고는 소속사가 실제로 있어야 함
  async createProfileUpload(target: ProfileImageTarget, targetId: string, contentType: string, sizeBytes: number) {
    if (target === 'ACTOR') await this.ensureActor(targetId);
    else if (!(await this.prisma.agency.findUnique({ where: { id: targetId }, select: { id: true } }))) {
      throw new NotFoundException('소속사를 찾을 수 없습니다.');
    }
    return this.media.createUploadAt(profileImagePrefix(target, targetId), 'PHOTO', contentType, sizeBytes);
  }

  /** null(삭제)은 그대로, 키면 이 대상의 프로필용으로 올린 진짜 이미지인지 확인 */
  async checkImageKey(target: ProfileImageTarget, id: string, key: string | null): Promise<string | null> {
    if (key === null) return null;
    await this.media.verifyAt(profileImagePrefix(target, id), 'PHOTO', key, '이 대상의 프로필용으로 올린 파일이 아니에요.');
    return key;
  }

  private async ensureActor(id: string) {
    const actor = await this.prisma.actor.findUnique({ where: { id }, select: { id: true } });
    if (!actor) throw new NotFoundException('배우를 찾을 수 없습니다.');
  }

  private async toResponse({ _count, ...row }: AdminActorRow) {
    return { ...(await this.actors.withImageUrls(row)), activeSubscriberCount: _count.subscriptions };
  }
}
