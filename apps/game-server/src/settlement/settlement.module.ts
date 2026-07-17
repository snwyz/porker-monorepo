import { Module } from "@nestjs/common";

import { OperatorSigner } from "./operator-signer.js";
import { ReconciliationService } from "./reconciliation.service.js";
import { WithdrawalController } from "./withdrawal.controller.js";
import { WithdrawalService } from "./withdrawal.service.js";

@Module({
  controllers: [WithdrawalController],
  providers: [OperatorSigner, WithdrawalService, ReconciliationService],
  exports: [ReconciliationService],
})
export class SettlementModule {}
