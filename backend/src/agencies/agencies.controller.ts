import { Controller, Get, Param, Query } from '@nestjs/common';
import { AgenciesService } from './agencies.service.js';
import { ListAgenciesQueryDto } from './dto/list-agencies-query.dto.js';
import { Public } from '../common/decorators/public.decorator.js';

@Controller('agencies')
export class AgenciesController {
  constructor(private readonly agenciesService: AgenciesService) {}

  @Public()
  @Get()
  findAll(@Query() query: ListAgenciesQueryDto) {
    return this.agenciesService.findAll(query.q);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agenciesService.findOne(id);
  }
}
