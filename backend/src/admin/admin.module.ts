import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminAgenciesController } from './admin-agencies.controller.js';
import { AdminAgenciesService } from './admin-agencies.service.js';
import { AdminActorsController } from './admin-actors.controller.js';
import { AdminActorsService } from './admin-actors.service.js';
import { ActorsModule } from '../actors/actors.module.js';

@Module({
  imports: [ActorsModule],
  controllers: [AdminUsersController, AdminAgenciesController, AdminActorsController],
  providers: [AdminUsersService, AdminAgenciesService, AdminActorsService],
})
export class AdminModule {}
