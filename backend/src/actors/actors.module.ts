import { Module } from '@nestjs/common';
import { ActorsController } from './actors.controller.js';
import { ActorsService } from './actors.service.js';

@Module({
  controllers: [ActorsController],
  providers: [ActorsService],
  exports: [ActorsService],
})
export class ActorsModule {}
