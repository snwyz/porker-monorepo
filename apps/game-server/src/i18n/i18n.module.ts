import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from "@nestjs/common";

import { configureLocaleContext } from "./locale-context.middleware.js";

@Module({})
export class I18nModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    configureLocaleContext(consumer);
  }
}
