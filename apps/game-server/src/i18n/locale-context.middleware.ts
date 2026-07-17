import {
  Injectable,
  RequestMethod,
  type MiddlewareConsumer,
  type NestMiddleware,
} from "@nestjs/common";
import type { Locale } from "@poker/i18n";

import { localeFromRequest } from "./locale-from-request.js";

export interface LocaleAwareRequest {
  cookies?: Record<string, unknown>;
  headers?: {
    cookie?: string | string[] | undefined;
    "accept-language"?: string | string[] | undefined;
  };
  locale?: Locale;
}

@Injectable()
export class LocaleContextMiddleware implements NestMiddleware {
  use(request: LocaleAwareRequest, _response: unknown, next: () => void): void {
    request.locale = localeFromRequest(request);
    next();
  }
}

export function configureLocaleContext(consumer: MiddlewareConsumer): void {
  consumer
    .apply(LocaleContextMiddleware)
    .forRoutes({ path: "*", method: RequestMethod.ALL });
}
