import { Controller, Get, Param, Query } from '@nestjs/common';
import { ActorsService } from './actors.service.js';
import { ListActorsQueryDto } from './dto/list-actors-query.dto.js';
import { Public } from '../common/decorators/public.decorator.js';

@Controller('actors')
export class ActorsController {
  constructor(private readonly actorsService: ActorsService) {}

  @Public()
  @Get()
  findAll(@Query() query: ListActorsQueryDto) {
    return this.actorsService.findAll(query.q);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.actorsService.findOne(id);
  }
}
