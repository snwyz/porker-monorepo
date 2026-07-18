import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { pathToFileURL } from "node:url";

import { AppModule } from "./app.module.js";
import { readAppMode } from "./config/app-mode.js";

export async function createApp() {
  const mode = readAppMode();
  const app = await NestFactory.create(AppModule.forRoot(mode), {
    logger: false,
  });
  app.enableShutdownHooks();
  app.use(cookieParser());
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(Number(process.env.PORT ?? 3001));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void bootstrap();
}
