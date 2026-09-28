import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ensureCanViewActor } from '../common/authorization/actor-access.js';
import { fanTag } from '../common/nickname/nickname.js';
import { Role } from '../generated/prisma/enums.js';
import { appError } from '../common/i18n/app-error.js';

/**
 * 배우 채널 단위 차단(잠정 정책) — 배우 본인·소속사·운영자가 운영자 승인 없이 바로. 차단된 팬은 이 배우에게
 * 답장만 못 보내고(구독·열람은 유지), 이미 보낸 답장·인용도 스타·소속사·다른 팬 화면에서 빠짐.
 * 서비스 전체 제재(정지·차단)는 별개로 운영자만.
 */
@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async block(requesterId: string, actorId: string, fanUserId: string, reason?: string) {
    await ensureCanViewActor(this.prisma, requesterId, actorId);
    const fan = await this.prisma.user.findUnique({ where: { id: fanUserId }, select: { role: true } });
    if (!fan) throw new NotFoundException(appError('USER_NOT_FOUND'));
    if (fan.role !== Role.USER) throw new BadRequestException(appError('BLOCK_FANS_ONLY'));
    await this.prisma.actorFanBlock.upsert({
      where: { actorId_fanUserId: { actorId, fanUserId } },
      create: { actorId, fanUserId, blockedById: requesterId, reason: reason?.trim() || null },
      update: {},
    });
    return this.list(requesterId, actorId);
  }

  async unblock(requesterId: string, actorId: string, fanUserId: string) {
    await ensureCanViewActor(this.prisma, requesterId, actorId);
    await this.prisma.actorFanBlock.deleteMany({ where: { actorId, fanUserId } });
    return this.list(requesterId, actorId);
  }

  // 차단 목록 — 스타·소속사에겐 닉네임 + 구분 태그만(로그인 이름은 안 보여줌)
  async list(requesterId: string, actorId: string) {
    await ensureCanViewActor(this.prisma, requesterId, actorId);
    const blocks = await this.prisma.actorFanBlock.findMany({
      where: { actorId },
      select: {
        createdAt: true,
        reason: true,
        fanUser: { select: { id: true, nickname: true } },
        blockedBy: { select: { role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return blocks.map(({ fanUser, blockedBy, ...block }) => ({
      ...block,
      blockedByRole: blockedBy.role,
      fanUser: { id: fanUser.id, nickname: fanUser.nickname, tag: fanTag(fanUser.id) },
    }));
  }
}
