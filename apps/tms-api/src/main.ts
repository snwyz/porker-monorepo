import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve } from "node:path";

import { AppModule, type TmsApiOptions } from "./app.module.js";
import { readTmsDataDirectory } from "./jobs/job.repository.js";
import { findRepositoryRoot } from "./runtime/repository-root.js";

const localTmsUiOrigins = [
  "http://127.0.0.1:4000",
  "http://localhost:4000",
];

export type CreateAppOptions = Partial<TmsApiOptions> & {
  readonly dataDirectory?: string;
};

export async function createApp(options?: CreateAppOptions) {
  const repositoryRoot = await findRepositoryRoot(
    fileURLToPath(import.meta.url),
  );
  const dataDirectory = await readTmsDataDirectory(
    options?.dataDirectory ?? process.env.TMS_DATA_DIR ?? join(repositoryRoot, "i18n-data/web"),
  );
  const app = await NestFactory.create(
    AppModule.forRoot(dataDirectory, {
      approvalSynchronization: options?.approvalSynchronization,
      i18nFiles: options?.i18nFiles ?? {
        enFile: resolve(repositoryRoot, "i18n-data/web/en.json"),
        zhFile: resolve(repositoryRoot, "i18n-data/web/zh-CN.json"),
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
      if (!isTrustedTmsClient(request.socket.remoteAddress)) {
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

export function isTrustedTmsClient(value: string | undefined): boolean {
  if (isLoopbackAddress(value)) return true;
  if (process.env.TMS_DOCKER_NETWORK !== "true" || value === undefined) {
    return false;
  }
  const address = value.replace(/^::ffff:/, "");
  return /^172\.(1[6-9]|2\d|3[01])\./.test(address) || /^10\./.test(address);
}

export function resolveLoopbackHost(value = process.env.HOST): string {
  const host = value ?? "127.0.0.1";
  if (
    !loopbackHosts.has(host) &&
    !(process.env.TMS_DOCKER_NETWORK === "true" && host === "0.0.0.0")
  ) {
    throw new Error("HOST must be a loopback address");
  }
  return host;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(Number(process.env.PORT ?? 4001), resolveLoopbackHost());
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void bootstrap();
}
