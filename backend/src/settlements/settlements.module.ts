import { Module } from '@nestjs/common';
import { ChargeLedgerService } from './charge-ledger.service.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  controllers: [SettlementsController],
  providers: [ChargeLedgerService, SettlementsService],
  exports: [ChargeLedgerService],
})
export class SettlementsModule {}
