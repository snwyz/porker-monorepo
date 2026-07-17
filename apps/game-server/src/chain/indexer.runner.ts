import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import { ChainIndexerService } from "./indexer.service.js";

function pollingInterval(): number {
  const value = Number(process.env.CHAIN_POLL_INTERVAL_MS ?? "5000");
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("CHAIN_POLL_INTERVAL_MS must be a positive integer");
  }
  return value;
}

@Injectable()
export class ChainIndexerRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ChainIndexerRunner.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;

  constructor(private readonly indexer: ChainIndexerService) {}

  onApplicationBootstrap(): void {
    const interval = pollingInterval();
    this.timer = setInterval(() => void this.poll(), interval);
    this.timer.unref?.();
    void this.poll();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
  }

  private poll(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.indexer
      .sync()
      .catch((error: unknown) => {
        this.logger.error(
          "Chain indexer poll failed; the next interval will retry",
          error instanceof Error ? error.stack : String(error),
        );
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
}
