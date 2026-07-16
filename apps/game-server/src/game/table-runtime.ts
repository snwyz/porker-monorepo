import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { TableState } from "@poker/engine";

export interface TableRuntime {
  state: TableState;
  actionDeadlineAt?: Date | null;
  actionTimer?: ReturnType<typeof setTimeout>;
}

@Injectable()
export class TableRuntimeStore implements OnModuleDestroy {
  private readonly runtimes = new Map<string, TableRuntime>();
  private readonly locks = new Map<string, Promise<void>>();

  get(roomId: string): TableRuntime | undefined {
    return this.runtimes.get(roomId);
  }

  set(roomId: string, runtime: TableRuntime): void {
    this.runtimes.set(roomId, runtime);
  }

  clear(roomId?: string): void {
    if (roomId) {
      const runtime = this.runtimes.get(roomId);
      if (runtime?.actionTimer) clearTimeout(runtime.actionTimer);
      this.runtimes.delete(roomId);
      return;
    }
    for (const runtime of this.runtimes.values()) {
      if (runtime.actionTimer) clearTimeout(runtime.actionTimer);
    }
    this.runtimes.clear();
  }

  onModuleDestroy(): void {
    this.clear();
  }

  async withLock<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(roomId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.locks.set(roomId, queued);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(roomId) === queued) this.locks.delete(roomId);
    }
  }
}
