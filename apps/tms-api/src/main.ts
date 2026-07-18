import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve } from "node:path";

import { AppModule, type TmsApiOptions } from "./app.module.js";
import { readTmsDataDirectory } from "./jobs/job.repository.js";
import { findRepositoryRoot } from "./runtime/repository-root.js";

const localTmsUiOrigins = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3001",
  "http://localhost:3001",
];

export type CreateAppOptions = Partial<TmsApiOptions> & {
  readonly dataDirectory?: string;
};

export async function createApp(options?: CreateAppOptions) {
  const repositoryRoot = await findRepositoryRoot(
    fileURLToPath(import.meta.url),
  );
  const dataDirectory = await readTmsDataDirectory(
    options?.dataDirectory ??
      process.env.TMS_DATA_DIR ??
      join(tmpdir(), "poker-next-tms-api"),
  );
  const app = await NestFactory.create(
    AppModule.forRoot(dataDirectory, {
      approvalSynchronization: options?.approvalSynchronization,
      i18nFiles: options?.i18nFiles ?? {
        enFile: resolve(repositoryRoot, "packages/i18n/src/locales/en.json"),
        zhFile: resolve(repositoryRoot, "packages/i18n/src/locales/zh-CN.json"),
      },
      replaceLocaleFile: options?.replaceLocaleFile,
      translationExecutor: options?.translationExecutor,
    }),
    {
      logger: false,
    },
  );
  app.use(
    (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        response.statusCode = 403;
        response.end("Local access only");
        return;
      }
      next();
    },
  );
  app.enableCors({
    credentials: false,
    origin: localTmsUiOrigins,
  });
  app.enableShutdownHooks();
  return app;
}

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isLoopbackAddress(value: string | undefined): boolean {
  return value !== undefined && loopbackAddresses.has(value);
}

export function resolveLoopbackHost(value = process.env.HOST): string {
  const host = value ?? "127.0.0.1";
  if (!loopbackHosts.has(host)) {
    throw new Error("HOST must be a loopback address");
  }
  return host;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(Number(process.env.PORT ?? 3002), resolveLoopbackHost());
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void bootstrap();
}
