import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service.js';
import { MediaService } from './media.service.js';
import { UploadsController } from './uploads.controller.js';
import { UploadCleanupService } from './upload-cleanup.service.js';

@Global()
@Module({
  controllers: [UploadsController],
  providers: [StorageService, MediaService, UploadCleanupService],
  exports: [StorageService, MediaService],
})
export class StorageModule {}
