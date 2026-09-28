import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminAgenciesController } from './admin-agencies.controller.js';
import { AdminAgenciesService } from './admin-agencies.service.js';

@Module({
  controllers: [AdminUsersController, AdminAgenciesController],
  providers: [AdminUsersService, AdminAgenciesService],
})
export class AdminModule {}
