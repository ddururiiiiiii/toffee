import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// legalName/officialProfileImageUrl는 탐색 화면(공식 프로필)에, chatDisplayName/chatProfileImageUrl는
// 채팅방 안에서(대화방 프로필)에 씀 — 어느 쪽을 보여줄지는 클라이언트가 화면 맥락에 맞게 고름
const LIST_SELECT = {
  id: true,
  legalName: true,
  officialProfileImageUrl: true,
  chatDisplayName: true,
  chatProfileImageUrl: true,
  monthlyPriceCents: true,
} as const;

@Injectable()
export class ActorsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query?: string) {
    return this.prisma.actor.findMany({
      where: query ? { legalName: { contains: query, mode: 'insensitive' } } : undefined,
      select: LIST_SELECT,
      orderBy: { legalName: 'asc' },
    });
  }

  async findOne(id: string) {
    const actor = await this.prisma.actor.findUnique({ where: { id }, select: LIST_SELECT });
    if (!actor) throw new NotFoundException('배우를 찾을 수 없습니다.');
    return actor;
  }
}
