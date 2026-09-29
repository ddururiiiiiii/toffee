import { Module } from '@nestjs/common';
import { AdminBundlesController, BundlesController } from './bundles.controller.js';
import { BundlesService } from './bundles.service.js';

@Module({
  controllers: [BundlesController, AdminBundlesController],
  providers: [BundlesService],
})
export class BundlesModule {}
