"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { z } from "zod";
import { refreshGuest } from "@/lib/api";
import {
  ClientLeaveSchema,
  ClientPlayerActionSchema,
  createTableSocket,
  emitAck,
  type Ack,
  type ClientPlayerAction,
} from "@/lib/socket";

const CardSchema = z.object({
  code: z.string(),
  rank: z.number(),
  suit: z.string(),
});
const PlayerSchema = z.object({
  id: z.string(),
  seat: z.number(),
  stack: z.number(),
  streetCommitted: z.number(),
  handCommitted: z.number(),
  status: z.enum(["active", "folded", "all-in"]),
});
const LegalActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fold") }),
  z.object({ type: z.literal("check") }),
  z.object({ type: z.literal("call"), amount: z.number().int().nonnegative() }),
  z.object({
    type: z.literal("bet"),
    minAmount: z.number().int().positive(),
    maxAmount: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("raise"),
    minAmount: z.number().int().positive(),
    maxAmount: z.number().int().positive(),
  }),
]);
const SnapshotSchema = z.object({
  tableId: z.string(),
  handId: z.string(),
  phase: z.enum(["preflop", "flop", "turn", "river", "complete"]),
  version: z.number().int().nonnegative(),
  actorId: z.string(),
  currentBet: z.number(),
  minimumRaise: z.number(),
  players: z.array(PlayerSchema),
  board: z.array(CardSchema),
  holeCards: z.record(z.string(), z.array(CardSchema)),
  legalActions: z.array(LegalActionSchema),
});

type Snapshot = z.infer<typeof SnapshotSchema>;
type LegalAction = z.infer<typeof LegalActionSchema>;
type LeavePayload = z.infer<typeof ClientLeaveSchema>;
type JoinAck = Ack & { playerId?: string; snapshot?: unknown };
type SnapshotAck = Ack & { snapshot?: unknown };
type LeaveAck = Ack & { cashOut?: string };
type JoinDetails = { seat: number; buyIn: number };
type RetryOperation =
  | { kind: "action"; payload: ClientPlayerAction }
  | { kind: "leave"; payload: LeavePayload };

function actionId(): string {
  return crypto.randomUUID();
}

function label(type: LegalAction["type"]): string {
  return type[0]!.toUpperCase() + type.slice(1);
}

export function TableClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const joinDetailsRef = useRef<JoinDetails | null>(null);
  const confirmedVersionRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [retryOperation, setRetryOperation] = useState<RetryOperation | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(0);

  const acceptSnapshot = useCallback((value: unknown) => {
    const parsed = SnapshotSchema.safeParse(value);
    if (!parsed.success) return;
    confirmedVersionRef.current = parsed.data.version;
    setSnapshot(parsed.data);
    const wager = parsed.data.legalActions.find(
      (action) => action.type === "bet" || action.type === "raise",
    );
    if (wager) setAmount(wager.minAmount);
  }, []);

  const refreshSnapshot = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return;
    const ack = await emitAck<SnapshotAck>(socket, "table:snapshot", {
      roomId,
    });
    if (ack.ok) acceptSnapshot(ack.snapshot);
    else setError(ack.code);
  }, [acceptSnapshot, roomId]);

  const restoreJoin = useCallback(
    async (details: JoinDetails) => {
      const socket = socketRef.current;
      if (!socket) return false;
      const sinceVersion = confirmedVersionRef.current;
      const ack = await emitAck<JoinAck>(socket, "table:join", {
        roomId,
        ...details,
        ...(sinceVersion === null ? {} : { sinceVersion }),
      });
      if (!ack.ok) {
        setError(ack.code);
        return false;
      }
      setPlayerId(ack.playerId ?? null);
      acceptSnapshot(ack.snapshot);
      setJoined(true);
      await refreshGuest();
      return true;
    },
    [acceptSnapshot, roomId],
  );

  useEffect(() => {
    const socket = createTableSocket();
    socketRef.current = socket;
    const onConnect = () => {
      const details = joinDetailsRef.current;
      if (!details) {
        setConnected(true);
        return;
      }
      setConnected(false);
      void restoreJoin(details)
        .then((restored) => setConnected(restored))
        .catch(() => setConnected(false));
    };
    const onDisconnect = () => setConnected(false);
    const onStateChanged = () => void refreshSnapshot();
    const onTableError = (ack: Ack) => {
      if (!ack.ok && ack.code === "STALE_VERSION") {
        setMessage(
          "Table changed while you acted. Resynced without discarding your view.",
        );
        void refreshSnapshot();
      }
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("table:snapshot", onStateChanged);
    socket.on("table:event", onStateChanged);
    socket.on("table:error", onTableError);
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [refreshSnapshot, restoreJoin]);

  const legal = snapshot?.legalActions ?? [];
  const wager = legal.find(
    (action) => action.type === "bet" || action.type === "raise",
  );
  const amountIsValid =
    !wager ||
    (Number.isInteger(amount) &&
      amount >= wager.minAmount &&
      amount <= wager.maxAmount);
  const pot =
    snapshot?.players.reduce((sum, player) => sum + player.handCommitted, 0) ??
    0;
  const ownCards = playerId ? (snapshot?.holeCards[playerId] ?? []) : [];

  const executeAction = useCallback(
    async (payload: ClientPlayerAction) => {
      const socket = socketRef.current;
      if (!socket) return;
      setPending(true);
      setError("");
      setMessage("");
      try {
        const ack = await emitAck<Ack>(socket, "table:action", payload);
        setRetryOperation(null);
        if (!ack.ok) {
          if (ack.code === "STALE_VERSION") {
            setMessage(
              "Table changed while you acted. Resynced without discarding your view.",
            );
            await refreshSnapshot();
          } else setError(ack.code);
        } else await refreshSnapshot();
      } catch (reason) {
        setRetryOperation({ kind: "action", payload });
        setError(
          reason instanceof Error
            ? `${reason.message}. Retry uses the same action id.`
            : "Action acknowledgement was lost.",
        );
      } finally {
        setPending(false);
      }
    },
    [refreshSnapshot],
  );

  const executeLeave = useCallback(
    async (payload: LeavePayload) => {
      const socket = socketRef.current;
      if (!socket) return;
      setPending(true);
      setError("");
      try {
        const ack = await emitAck<LeaveAck>(socket, "table:leave", payload);
        setRetryOperation(null);
        if (!ack.ok) setError(ack.code);
        else {
          await refreshGuest();
          router.push("/lobby");
        }
      } catch (reason) {
        setRetryOperation({ kind: "leave", payload });
        setError(
          reason instanceof Error
            ? `${reason.message}. Retry uses the same leave id.`
            : "Leave acknowledgement was lost.",
        );
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  async function submitAction(action: LegalAction) {
    if (!snapshot || !amountIsValid) return;
    const base = {
      roomId,
      handId: snapshot.handId,
      actionId: actionId(),
      expectedVersion: snapshot.version,
    };
    const payload = ClientPlayerActionSchema.parse(
      action.type === "bet" || action.type === "raise"
        ? { ...base, type: action.type, amount }
        : { ...base, type: action.type },
    );
    await executeAction(payload);
  }

  if (!joined) {
    return (
      <main>
        <h1>Join table</h1>
        <p data-testid="connection-status">
          {connected ? "Connected" : "Reconnecting"}
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const details = {
              seat: Number(data.get("seat")),
              buyIn: Number(data.get("buyIn")),
            };
            joinDetailsRef.current = details;
            setPending(true);
            setError("");
            try {
              await restoreJoin(details);
            } catch (reason) {
              setError(
                reason instanceof Error ? reason.message : "Join failed",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <label>
            Seat
            <input
              name="seat"
              type="number"
              min="0"
              defaultValue="0"
              required
            />
          </label>
          <label>
            Buy-in
            <input
              name="buyIn"
              type="number"
              min="1"
              defaultValue="500"
              required
            />
          </label>
          <button disabled={!connected || pending} type="submit">
            Join table
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </main>
    );
  }

  return (
    <main data-testid="table-state">
      <div className="row">
        <h1>Table</h1>
        <span data-testid="connection-status">
          {connected ? "Connected" : "Reconnecting"}
        </span>
        <button
          disabled={pending || snapshot?.phase !== "complete"}
          onClick={() =>
            void executeLeave(
              ClientLeaveSchema.parse({ roomId, actionId: actionId() }),
            )
          }
          type="button"
        >
          Leave table
        </button>
      </div>
      {retryOperation && (
        <button
          disabled={pending}
          onClick={() =>
            void (retryOperation.kind === "action"
              ? executeAction(retryOperation.payload)
              : executeLeave(retryOperation.payload))
          }
          type="button"
        >
          Retry {retryOperation.kind}
        </button>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {snapshot ? (
        <section className="panel">
          <div className="row">
            <span>
              Phase: <strong data-testid="phase">{snapshot.phase}</strong>
            </span>
            <span data-testid="pot">Pot: {pot}</span>
            <span data-testid="current-bet">
              Current bet: {snapshot.currentBet}
            </span>
            <span>
              Version: <strong data-testid="version">{snapshot.version}</strong>
            </span>
          </div>
          <p>
            Board: {snapshot.board.map((card) => card.code).join(" ") || "—"}
          </p>
          <p data-testid="hole-cards">
            Your cards: {ownCards.map((card) => card.code).join(" ") || "—"}
          </p>
          <h2>Seats</h2>
          <ol>
            {snapshot.players.map((player) => (
              <li key={player.id}>
                Seat {player.seat}: {player.id === playerId ? "You" : player.id}{" "}
                · stack {player.stack} · {player.status}
              </li>
            ))}
          </ol>
          <h2>Legal actions</h2>
          <div className="row">
            {legal.map((action) => (
              <button
                disabled={
                  pending ||
                  ((action.type === "bet" || action.type === "raise") &&
                    !amountIsValid)
                }
                key={action.type}
                onClick={() => void submitAction(action)}
                type="button"
              >
                {label(action.type)}
                {action.type === "call" ? ` ${action.amount}` : ""}
              </button>
            ))}
            {wager && (
              <label>
                Amount
                <input
                  aria-label="Amount"
                  max={wager.maxAmount}
                  min={wager.minAmount}
                  onChange={(event) => setAmount(Number(event.target.value))}
                  type="number"
                  value={amount}
                />
                <span data-testid="amount-range">
                  {wager.minAmount}–{wager.maxAmount}
                </span>
              </label>
            )}
            {legal.length === 0 && <span>Waiting for another player.</span>}
          </div>
        </section>
      ) : (
        <section className="panel">
          <p>Waiting for another player.</p>
        </section>
      )}
    </main>
  );
}
