import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminAgenciesController } from './admin-agencies.controller.js';
import { AdminAgenciesService } from './admin-agencies.service.js';
import { AdminActorsController } from './admin-actors.controller.js';
import { AdminActorsService } from './admin-actors.service.js';
import { ActorsModule } from '../actors/actors.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminStatsController } from './admin-stats.controller.js';
import { AdminStatsService } from './admin-stats.service.js';

@Module({
  imports: [ActorsModule, NotificationsModule],
  controllers: [AdminUsersController, AdminAgenciesController, AdminActorsController, AdminStatsController],
  providers: [AdminUsersService, AdminAgenciesService, AdminActorsService, AdminStatsService],
})
export class AdminModule {}
