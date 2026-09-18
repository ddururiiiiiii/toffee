import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { BannedWordsService } from './banned-words.service.js';
import { CreateBannedWordDto } from './dto/create-banned-word.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';

@Roles(Role.ADMIN)
@Controller('admin/banned-words')
export class BannedWordsController {
  constructor(private readonly bannedWordsService: BannedWordsService) {}

  @Get()
  findAll() {
    return this.bannedWordsService.findAll();
  }

  @Post()
  create(@Body() dto: CreateBannedWordDto) {
    return this.bannedWordsService.create(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bannedWordsService.remove(id);
  }
}
