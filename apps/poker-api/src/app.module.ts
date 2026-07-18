import { type DynamicModule, Module } from "@nestjs/common";

import type { AppMode } from "./config/app-mode.js";
import { ChainModule } from "./chain/chain.module.js";
import { CapabilitiesController } from "./config/capabilities.controller.js";
import { APP_MODE, AUDIT_KEY } from "./config/tokens.js";
import { DatabaseLifecycleService } from "./database/database-lifecycle.service.js";
import { GameGateway } from "./game/game.gateway.js";
import { RecoveryService } from "./game/recovery.service.js";
import { TableRepository } from "./game/table-repository.js";
import { TableRuntimeStore } from "./game/table-runtime.js";
import { HealthController } from "./health/health.controller.js";
import { GuestController } from "./identity/guest.controller.js";
import { GuestService } from "./identity/guest.service.js";
import { WalletController } from "./identity/wallet.controller.js";
import { WalletService } from "./identity/wallet.service.js";
import { I18nModule } from "./i18n/i18n.module.js";
import { RoomsController } from "./rooms/rooms.controller.js";
import { RoomsService } from "./rooms/rooms.service.js";
import { SettlementModule } from "./settlement/settlement.module.js";
import { TraceController } from "./trace/trace.controller.js";
import { TraceService } from "./trace/trace.service.js";

@Module({
  imports: [I18nModule],
  controllers: [
    CapabilitiesController,
    GuestController,
    WalletController,
    HealthController,
    RoomsController,
    TraceController,
  ],
  providers: [
    DatabaseLifecycleService,
    GameGateway,
    GuestService,
    WalletService,
    RecoveryService,
    RoomsService,
    TableRepository,
    TableRuntimeStore,
    TraceService,
  ],
})
export class AppModule {
  static forRoot(mode: AppMode): DynamicModule {
    return {
      module: AppModule,
      imports:
        mode === "web3"
          ? [I18nModule, ChainModule.forRoot(), SettlementModule]
          : [I18nModule],
      providers: [
        { provide: APP_MODE, useValue: mode },
        {
          provide: AUDIT_KEY,
          useFactory: () =>
            process.env.POKER_AUDIT_KEY ??
            (process.env.NODE_ENV === "test"
              ? "test-only-audit-key-with-32-bytes"
              : (() => {
                  throw new Error("POKER_AUDIT_KEY is required");
                })()),
        },
      ],
    };
  }
}
