import { Controller, Get, Inject } from "@nestjs/common";

import type { AppMode } from "./app-mode.js";
import { APP_MODE } from "./tokens.js";

@Controller("v1/capabilities")
export class CapabilitiesController {
  constructor(@Inject(APP_MODE) private readonly mode: AppMode) {}

  @Get()
  getCapabilities(): { mode: AppMode } {
    return { mode: this.mode };
  }
}
