import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { pathToFileURL } from "node:url";

import { AppModule } from "./app.module.js";
import { readTmsDataDirectory } from "./jobs/job.repository.js";

export async function createApp() {
  const dataDirectory = await readTmsDataDirectory();
  const app = await NestFactory.create(AppModule.forRoot(dataDirectory), {
    logger: false,
  });
  app.enableShutdownHooks();
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(
    Number(process.env.PORT ?? 3002),
    process.env.HOST ?? "127.0.0.1",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void bootstrap();
}
