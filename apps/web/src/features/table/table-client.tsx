"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { z } from "zod";
import { adjustStoredPoints } from "@/lib/api";
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
const SnapshotSchema = z.object({
  tableId: z.string(),
  handId: z.string(),
  phase: z.enum(["preflop", "flop", "turn", "river", "complete"]),
  version: z.number().int().nonnegative(),
  actorId: z.string(),
  currentBet: z.number(),
  minimumRaise: z.number(),
  players: z.array(PlayerSchema),
  raiseRights: z.array(z.string()),
  board: z.array(CardSchema),
  holeCards: z.record(z.string(), z.array(CardSchema)),
});

type Snapshot = z.infer<typeof SnapshotSchema>;
type JoinAck = Ack & { playerId?: string; snapshot?: unknown };
type SnapshotAck = Ack & { snapshot?: unknown };
type LeaveAck = Ack & { cashOut?: string };

function actionId(): string {
  return crypto.randomUUID();
}

function legalActions(snapshot: Snapshot | null, playerId: string | null) {
  if (
    !snapshot ||
    !playerId ||
    snapshot.phase === "complete" ||
    snapshot.actorId !== playerId
  ) {
    return [] as Array<ClientPlayerAction["type"]>;
  }
  const player = snapshot.players.find(
    (candidate) => candidate.id === playerId,
  );
  if (!player || player.status !== "active") return [];
  const toCall = Math.max(0, snapshot.currentBet - player.streetCommitted);
  const actions: Array<ClientPlayerAction["type"]> = [
    "fold",
    toCall > 0 ? "call" : "check",
  ];
  if (snapshot.raiseRights.includes(playerId))
    actions.push(snapshot.currentBet > 0 ? "raise" : "bet");
  return actions;
}

function ActionButton({
  type,
  disabled,
  onAction,
}: {
  type: ClientPlayerAction["type"];
  disabled: boolean;
  onAction: (type: ClientPlayerAction["type"]) => void;
}) {
  return (
    <button disabled={disabled} onClick={() => onAction(type)} type="button">
      {type[0]!.toUpperCase() + type.slice(1)}
    </button>
  );
}

export function TableClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(20);

  const acceptSnapshot = useCallback((value: unknown) => {
    const parsed = SnapshotSchema.safeParse(value);
    if (parsed.success) setSnapshot(parsed.data);
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

  useEffect(() => {
    const socket = createTableSocket();
    socketRef.current = socket;
    const onConnect = () => setConnected(true);
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
  }, [refreshSnapshot]);

  const legal = useMemo(
    () => legalActions(snapshot, playerId),
    [snapshot, playerId],
  );
  const pot =
    snapshot?.players.reduce((sum, player) => sum + player.handCommitted, 0) ??
    0;
  const ownCards = playerId ? (snapshot?.holeCards[playerId] ?? []) : [];

  async function submitAction(type: ClientPlayerAction["type"]) {
    const socket = socketRef.current;
    if (!socket || !snapshot) return;
    const base = {
      roomId,
      handId: snapshot.handId,
      actionId: actionId(),
      expectedVersion: snapshot.version,
    };
    const action = ClientPlayerActionSchema.parse(
      type === "bet" || type === "raise"
        ? { ...base, type, amount }
        : { ...base, type },
    );
    setPending(true);
    setError("");
    setMessage("");
    try {
      const ack = await emitAck<Ack>(socket, "table:action", action);
      if (!ack.ok) {
        if (ack.code === "STALE_VERSION") {
          setMessage(
            "Table changed while you acted. Resynced without discarding your view.",
          );
          await refreshSnapshot();
        } else setError(ack.code);
      } else await refreshSnapshot();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed");
    } finally {
      setPending(false);
    }
  }

  if (!joined) {
    return (
      <main>
        <h1>Join table</h1>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const socket = socketRef.current;
            if (!socket) return;
            const data = new FormData(event.currentTarget);
            const buyIn = Number(data.get("buyIn"));
            setPending(true);
            setError("");
            try {
              const ack = await emitAck<JoinAck>(socket, "table:join", {
                roomId,
                seat: Number(data.get("seat")),
                buyIn,
              });
              if (!ack.ok) setError(ack.code);
              else {
                setPlayerId(ack.playerId ?? null);
                acceptSnapshot(ack.snapshot);
                adjustStoredPoints(-buyIn);
                setJoined(true);
              }
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
          {!connected && <span>Connecting…</span>}
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
        <button
          disabled={pending || snapshot?.phase !== "complete"}
          onClick={async () => {
            const socket = socketRef.current;
            if (!socket) return;
            setPending(true);
            const payload = ClientLeaveSchema.parse({
              roomId,
              actionId: actionId(),
            });
            try {
              const ack = await emitAck<LeaveAck>(
                socket,
                "table:leave",
                payload,
              );
              if (!ack.ok) setError(ack.code);
              else {
                adjustStoredPoints(Number(ack.cashOut ?? 0));
                router.push("/lobby");
              }
            } finally {
              setPending(false);
            }
          }}
          type="button"
        >
          Leave table
        </button>
      </div>
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
            <span>Version: {snapshot.version}</span>
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
            {legal.map((type) => (
              <ActionButton
                disabled={pending}
                key={type}
                onAction={submitAction}
                type={type}
              />
            ))}
            {legal.some((type) => type === "bet" || type === "raise") && (
              <label>
                Amount
                <input
                  min="1"
                  onChange={(event) => setAmount(Number(event.target.value))}
                  type="number"
                  value={amount}
                />
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
