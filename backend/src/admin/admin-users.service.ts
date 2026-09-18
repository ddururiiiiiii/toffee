import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserStatus } from '../generated/prisma/enums.js';

const LIST_SELECT = {
  id: true,
  displayName: true,
  email: true,
  role: true,
  status: true,
  suspendedUntil: true,
  bannedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query?: string) {
    return this.prisma.user.findMany({
      where: query
        ? { OR: [{ displayName: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }] }
        : undefined,
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  suspend(userId: string, until: Date) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.SUSPENDED, suspendedUntil: until, bannedAt: null },
      select: LIST_SELECT,
    });
  }

  ban(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.BANNED, bannedAt: new Date(), suspendedUntil: null },
      select: LIST_SELECT,
    });
  }

  reactivate(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE, suspendedUntil: null, bannedAt: null },
      select: LIST_SELECT,
    });
  }
}
