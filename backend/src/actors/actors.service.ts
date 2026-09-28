import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ensureCanViewActor, viewableActorsWhere } from '../common/authorization/actor-access.js';
import { MessageSenderType, Role } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MediaService } from '../storage/media.service.js';

// legalName/officialProfileImageUrl는 탐색 화면(공식 프로필)에, chatDisplayName/chatProfileImageUrl는
// 채팅방 안에서(대화방 프로필)에 씀 — 어느 쪽을 보여줄지는 클라이언트가 화면 맥락에 맞게 고름
const LIST_SELECT = {
  id: true,
  legalName: true,
  officialProfileImageUrl: true,
  chatDisplayName: true,
  chatProfileImageUrl: true,
  monthlyPriceCents: true,
  // 소속사는 팬에게도 공개(소속사별 목록/검색) — 무소속이면 null
  agency: { select: { id: true, name: true, logoUrl: true } },
} as const;

@Injectable()
export class ActorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  // q는 배우 이름뿐 아니라 소속사 이름에도 매칭 — "GMMTV"로 검색하면 소속 배우가 다 나오게
  async findAll(query?: string, agencyId?: string) {
    const where: Prisma.ActorWhereInput = {};
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
      orderBy: { legalName: 'asc' },
    });
    return Promise.all(actors.map((actor) => this.withImageUrls(actor)));
  }

  async findOne(id: string) {
    const actor = await this.prisma.actor.findUnique({ where: { id }, select: LIST_SELECT });
    if (!actor) throw new NotFoundException('배우를 찾을 수 없습니다.');
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
    },
  >(actor: T): Promise<T> {
    const [officialProfileImageUrl, chatProfileImageUrl, logoUrl] = await Promise.all([
      this.media.resolveImageUrl(actor.officialProfileImageUrl),
      this.media.resolveImageUrl(actor.chatProfileImageUrl),
      this.media.resolveImageUrl(actor.agency?.logoUrl ?? null),
    ]);
    return {
      ...actor,
      officialProfileImageUrl,
      chatProfileImageUrl,
      agency: actor.agency && { ...actor.agency, logoUrl },
    };
  }
}
