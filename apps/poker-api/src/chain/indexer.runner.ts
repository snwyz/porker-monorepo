import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
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
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(ChainIndexerRunner.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;
  private stopping = false;

  constructor(private readonly indexer: ChainIndexerService) {}

  onApplicationBootstrap(): void {
    this.stopping = false;
    const interval = pollingInterval();
    this.timer = setInterval(() => void this.poll(), interval);
    this.timer.unref?.();
    void this.poll();
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
  }

  private poll(): Promise<void> {
    if (this.stopping) return Promise.resolve();
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
