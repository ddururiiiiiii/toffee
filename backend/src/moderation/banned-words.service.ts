import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateBannedWordDto } from './dto/create-banned-word.dto.js';
import { appError } from '../common/i18n/app-error.js';

@Injectable()
export class BannedWordsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.bannedWord.findMany({ orderBy: [{ language: 'asc' }, { term: 'asc' }] });
  }

  async create(dto: CreateBannedWordDto) {
    const existing = await this.prisma.bannedWord.findUnique({
      where: { term_language: { term: dto.term, language: dto.language } },
    });
    if (existing) throw new BadRequestException(appError('BANNED_WORD_EXISTS'));
    return this.prisma.bannedWord.create({ data: dto });
  }

  async remove(id: string) {
    await this.prisma.bannedWord.delete({ where: { id } });
  }
}
