import { Inject, Injectable } from "@nestjs/common";
import { assertInvariants, type TableState } from "@poker/engine";
import { AUDIT_KEY } from "../config/tokens.js";
import { decryptTableState } from "./deck.js";

import { TableRepository } from "./table-repository.js";
import { TableRuntimeStore, type TableRuntime } from "./table-runtime.js";

const EVENT_TYPES = new Set([
  "player-folded",
  "player-checked",
  "player-called",
  "player-bet",
  "player-raised",
  "street-completed",
  "hand-settled",
]);

function isValidEventPayload(type: string, payload: unknown): boolean {
  if (!EVENT_TYPES.has(type) || typeof payload !== "object" || payload === null)
    return false;
  const value = payload as Record<string, unknown>;
  if (value.type !== type) return false;
  if (type === "hand-settled") {
    return (
      typeof value.stacks === "object" &&
      value.stacks !== null &&
      Object.values(value.stacks).every(
        (chips) => Number.isInteger(chips) && (chips as number) >= 0,
      )
    );
  }
  if (type === "street-completed")
    return ["flop", "turn", "river", "complete"].includes(
      value.phase as string,
    );
  if (typeof value.playerId !== "string" || value.playerId.length === 0)
    return false;
  if (
    ["player-called", "player-bet", "player-raised"].includes(type) &&
    (!Number.isInteger(value.amount) || (value.amount as number) <= 0)
  )
    return false;
  return type !== "player-raised" || typeof value.fullRaise === "boolean";
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
    @Inject(AUDIT_KEY) private readonly auditKey: string,
  ) {}

  async recover(roomId: string): Promise<TableRuntime | null> {
    const cached = this.runtimes.get(roomId);
    if (cached) return cached;
    const snapshot = await this.repository.loadLatestSnapshot(roomId);
    if (!snapshot) return null;
    let decrypted: unknown;
    try {
      decrypted = decryptTableState(this.auditKey, snapshot.state);
    } catch {
      await this.repository.setDraining(roomId);
      return null;
    }
    if (
      !isTableState(decrypted) ||
      decrypted.tableId !== roomId ||
      decrypted.handId !== snapshot.handId ||
      decrypted.version !== snapshot.version
    ) {
      await this.repository.setDraining(roomId);
      return null;
    }
    try {
      assertInvariants(decrypted);
    } catch {
      await this.repository.setDraining(roomId);
      return null;
    }
    if (
      (decrypted.phase === "complete" && snapshot.actionDeadlineAt !== null) ||
      (decrypted.phase !== "complete" &&
        (!(snapshot.actionDeadlineAt instanceof Date) ||
          !Number.isFinite(snapshot.actionDeadlineAt.getTime())))
    ) {
      await this.repository.setDraining(roomId);
      return null;
    }
    const playerIds = new Set(decrypted.players.map((player) => player.id));
    const events = await this.repository.loadEventsAfter(snapshot.handId, 0);
    let priorVersion = 0;
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]!;
      if (
        event.sequence !== index + 1 ||
        event.version < priorVersion ||
        event.version > priorVersion + 2 ||
        !isValidEventPayload(event.type, event.payload)
      ) {
        await this.repository.setDraining(roomId);
        return null;
      }
      const payload = event.payload as Record<string, unknown>;
      if (
        (typeof payload.playerId === "string" &&
          !playerIds.has(payload.playerId)) ||
        (event.type === "hand-settled" &&
          Object.keys(payload.stacks as Record<string, unknown>).some(
            (id) => !playerIds.has(id),
          ))
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
    const runtime = {
      state: decrypted,
      actionDeadlineAt: snapshot.actionDeadlineAt,
    };
    this.runtimes.set(roomId, runtime);
    return runtime;
  }
}
