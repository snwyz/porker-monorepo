import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { AppModule, type TmsApiOptions } from "./app.module.js";
import { readTmsDataDirectory } from "./jobs/job.repository.js";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);

export async function createApp(options?: Partial<TmsApiOptions>) {
  const dataDirectory = await readTmsDataDirectory();
  const app = await NestFactory.create(
    AppModule.forRoot(dataDirectory, {
      i18nFiles: options?.i18nFiles ?? {
        catalogFile: resolve(repositoryRoot, "packages/i18n/src/catalog.json"),
        enFile: resolve(repositoryRoot, "packages/i18n/src/locales/en.json"),
        zhFile: resolve(repositoryRoot, "packages/i18n/src/locales/zh-CN.json"),
      },
      snapshotRepository: options?.snapshotRepository,
      translationExecutor: options?.translationExecutor,
    }),
    {
      logger: false,
    },
  );
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
