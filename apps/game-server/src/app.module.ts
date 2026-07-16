import { type DynamicModule, Module } from "@nestjs/common";

import type { AppMode } from "./config/app-mode.js";
import { CapabilitiesController } from "./config/capabilities.controller.js";
import { APP_MODE, AUDIT_KEY } from "./config/tokens.js";
import { DatabaseLifecycleService } from "./database/database-lifecycle.service.js";
import { GameGateway } from "./game/game.gateway.js";
import { RecoveryService } from "./game/recovery.service.js";
import { TableRepository } from "./game/table-repository.js";
import { TableRuntimeStore } from "./game/table-runtime.js";
import { GuestController } from "./identity/guest.controller.js";
import { GuestService } from "./identity/guest.service.js";
import { RoomsController } from "./rooms/rooms.controller.js";
import { RoomsService } from "./rooms/rooms.service.js";

@Module({
  controllers: [CapabilitiesController, GuestController, RoomsController],
  providers: [
    DatabaseLifecycleService,
    GameGateway,
    GuestService,
    RecoveryService,
    RoomsService,
    TableRepository,
    TableRuntimeStore,
  ],
})
export class AppModule {
  static forRoot(mode: AppMode): DynamicModule {
    return {
      module: AppModule,
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
