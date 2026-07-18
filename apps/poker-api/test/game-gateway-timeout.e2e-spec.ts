import { afterEach, describe, expect, it, vi } from "vitest";

import { GameGateway } from "../src/game/game.gateway.js";
import { RecoveryService } from "../src/game/recovery.service.js";
import { TableRepository } from "../src/game/table-repository.js";
import {
  TableRuntimeStore,
  type TableRuntime,
} from "../src/game/table-runtime.js";

describe("GameGateway timeout scheduling", () => {
  afterEach(() => vi.useRealTimers());

  it("does not let a queued stale deadline act on a newer runtime", async () => {
    vi.useFakeTimers();
    const runtime = {
      state: {
        handId: "hand-1",
        version: 1,
        actorId: "actor-1",
        phase: "preflop",
      },
      actionDeadlineAt: null,
    } as unknown as TableRuntime;
    const findAction = vi.fn();
    const repository = {
      findAction,
      setDraining: vi.fn(),
    } as unknown as TableRepository;
    const runtimes = {
      get: vi.fn(() => runtime),
      withLock: vi.fn(async (_roomId: string, operation: () => Promise<void>) =>
        operation(),
      ),
    } as unknown as TableRuntimeStore;
    const recovery = {
      recover: vi.fn(async () => runtime),
    } as unknown as RecoveryService;
    const gateway = new GameGateway(
      repository,
      runtimes,
      recovery,
      "audit-key",
    );
    const scheduleTimeout = Reflect.get(gateway, "scheduleTimeout") as (
      roomId: string,
      deadlineAt: Date,
    ) => void;

    scheduleTimeout.call(gateway, "room-1", new Date(Date.now() + 10));
    runtime.state = { ...runtime.state, version: 2, actorId: "actor-2" };
    await vi.advanceTimersByTimeAsync(10);

    expect(findAction).not.toHaveBeenCalled();
  });
});
