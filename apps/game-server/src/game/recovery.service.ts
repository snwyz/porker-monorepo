import { Injectable } from "@nestjs/common";
import type { TableState } from "@poker/engine";

import { TableRepository } from "./table-repository.js";
import { TableRuntimeStore, type TableRuntime } from "./table-runtime.js";

const EVENT_TYPES = new Set([
  "player-folded",
  "player-checked",
  "player-called",
  "player-bet",
  "player-raised",
  "street-completed",
]);

function isValidEventPayload(type: string, payload: unknown): boolean {
  return (
    EVENT_TYPES.has(type) &&
    typeof payload === "object" &&
    payload !== null &&
    (payload as { type?: unknown }).type === type
  );
}

function isTableState(value: unknown): value is TableState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<TableState>;
  return (
    typeof state.tableId === "string" &&
    typeof state.handId === "string" &&
    typeof state.version === "number" &&
    Array.isArray(state.players) &&
    state.players.length >= 2
  );
}

@Injectable()
export class RecoveryService {
  constructor(
    private readonly repository: TableRepository,
    private readonly runtimes: TableRuntimeStore,
  ) {}

  async recover(roomId: string): Promise<TableRuntime | null> {
    const cached = this.runtimes.get(roomId);
    if (cached) return cached;
    const snapshot = await this.repository.loadLatestSnapshot(roomId);
    if (!snapshot) return null;
    if (
      !isTableState(snapshot.state) ||
      snapshot.state.version !== snapshot.version
    ) {
      await this.repository.setDraining(roomId);
      return null;
    }
    const events = await this.repository.loadEventsAfter(snapshot.handId, 0);
    let priorVersion = 0;
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]!;
      if (
        event.sequence !== index + 1 ||
        event.version < priorVersion ||
        event.version > priorVersion + 1 ||
        !isValidEventPayload(event.type, event.payload)
      ) {
        await this.repository.setDraining(roomId);
        return null;
      }
      priorVersion = event.version;
    }
    if (events.length > 0 && priorVersion !== snapshot.version) {
      await this.repository.setDraining(roomId);
      return null;
    }
    const runtime = { state: snapshot.state };
    this.runtimes.set(roomId, runtime);
    return runtime;
  }
}
