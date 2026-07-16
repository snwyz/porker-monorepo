import { type DynamicModule, Module } from "@nestjs/common";

import type { AppMode } from "./config/app-mode.js";
import { CapabilitiesController } from "./config/capabilities.controller.js";
import { APP_MODE } from "./config/tokens.js";
import { DatabaseLifecycleService } from "./database/database-lifecycle.service.js";
import { GuestController } from "./identity/guest.controller.js";
import { GuestService } from "./identity/guest.service.js";
import { RoomsController } from "./rooms/rooms.controller.js";
import { RoomsService } from "./rooms/rooms.service.js";

@Module({
  controllers: [CapabilitiesController, GuestController, RoomsController],
  providers: [DatabaseLifecycleService, GuestService, RoomsService],
})
export class AppModule {
  static forRoot(mode: AppMode): DynamicModule {
    return {
      module: AppModule,
      providers: [{ provide: APP_MODE, useValue: mode }],
    };
  }
}
