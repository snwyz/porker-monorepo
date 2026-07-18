"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { z } from "zod";
import {
  PokerTable,
  type PokerActionIntent,
  type TableViewModel,
} from "@/components/poker/poker-table";
import { Button } from "@/components/ui/button";
import { useI18n } from "@poker/next-i18n/react";
import { refreshGuest } from "@/lib/api";
import {
  ClientLeaveSchema,
  ClientPlayerActionSchema,
  createTableSocket,
  emitAck,
  formatAckError,
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
  minBuyIn: z.number().int().positive(),
  buttonSeat: z.number().int().nonnegative().optional(),
  players: z.array(PlayerSchema),
  board: z.array(CardSchema),
  holeCards: z.record(z.string(), z.array(CardSchema)),
  legalActions: z.array(LegalActionSchema),
  settlement: z
    .object({
      type: z.literal("hand-settled"),
      pot: z.number().int().nonnegative(),
      awards: z.record(z.string(), z.number().int().nonnegative()),
    })
    .optional(),
});

type Snapshot = z.infer<typeof SnapshotSchema>;
type LeavePayload = z.infer<typeof ClientLeaveSchema>;
type JoinAck = Ack & { playerId?: string; snapshot?: unknown };
type SnapshotAck = Ack & { snapshot?: unknown };
type LeaveAck = Ack & { cashOut?: string };
type JoinDetails = { buyIn: number };
type RetryOperation =
  | { kind: "action"; payload: ClientPlayerAction }
  | { kind: "leave"; payload: LeavePayload };
type Settlement = { handId: string; pot: number; awards: Record<string, number> };

const HandSettledEventSchema = z.object({
  handId: z.string(),
  event: z.object({
    type: z.literal("hand-settled"),
    pot: z.number().int().nonnegative(),
    awards: z.record(z.string(), z.number().int().nonnegative()),
  }),
});

function actionId(): string {
  return crypto.randomUUID();
}

export function TableClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { locale, t } = useI18n();
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
  const [settlement, setSettlement] = useState<Settlement | null>(null);

  const acceptSnapshot = useCallback((value: unknown) => {
    const parsed = SnapshotSchema.safeParse(value);
    if (!parsed.success) return;
    confirmedVersionRef.current = parsed.data.version;
    if (parsed.data.settlement) {
      setSettlement({
        handId: parsed.data.handId,
        pot: parsed.data.settlement.pot,
        awards: parsed.data.settlement.awards,
      });
    }
    setSnapshot(parsed.data);
  }, []);

  const refreshSnapshot = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return;
    const ack = await emitAck<SnapshotAck>(socket, "table:snapshot", {
      roomId,
    });
    if (ack.ok) acceptSnapshot(ack.snapshot);
    else setError(formatAckError(ack, locale));
  }, [acceptSnapshot, locale, roomId]);

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
        setError(formatAckError(ack, locale));
        return false;
      }
      setPlayerId(ack.playerId ?? null);
      acceptSnapshot(ack.snapshot);
      setJoined(true);
      await refreshGuest();
      return true;
    },
    [acceptSnapshot, locale, roomId],
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
    const onTableEvent = (value: unknown) => {
      const settled = HandSettledEventSchema.safeParse(value);
      if (settled.success) {
        setSettlement({
          handId: settled.data.handId,
          pot: settled.data.event.pot,
          awards: settled.data.event.awards,
        });
        window.setTimeout(() => setSettlement(null), 5_500);
      }
      void refreshSnapshot();
    };
    const onTableError = (ack: Ack) => {
      if (!ack.ok && ack.code === "P000188") {
        setMessage(
          `${t("P000191")}${ack.traceId ? `（追踪 ID：${ack.traceId}）` : ""}`,
        );
        void refreshSnapshot();
      }
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("table:snapshot", onStateChanged);
    socket.on("table:event", onTableEvent);
    socket.on("table:error", onTableError);
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [refreshSnapshot, restoreJoin, t]);

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
          if (ack.code === "P000188") {
            setMessage(t("P000191"));
            await refreshSnapshot();
          } else setError(formatAckError(ack, locale));
        } else await refreshSnapshot();
      } catch {
        setRetryOperation({ kind: "action", payload });
        setError(t("P000189"));
      } finally {
        setPending(false);
      }
    },
    [locale, refreshSnapshot, t],
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
        if (!ack.ok) setError(formatAckError(ack, locale));
        else {
          router.push(`/${locale}/lobby`);
          void refreshGuest();
        }
      } catch {
        setRetryOperation({ kind: "leave", payload });
        setError(t("P000190"));
      } finally {
        setPending(false);
      }
    },
    [locale, router, t],
  );

  async function submitAction(intent: PokerActionIntent) {
    if (!snapshot) return;
    const action = snapshot.legalActions.find(
      (candidate) => candidate.type === intent.type,
    );
    if (!action) return;
    const base = {
      roomId,
      handId: snapshot.handId,
      actionId: actionId(),
      expectedVersion: snapshot.version,
    };
    const payload = ClientPlayerActionSchema.parse(
      intent.type === "bet" || intent.type === "raise"
        ? { ...base, type: intent.type, amount: intent.amount }
        : { ...base, type: intent.type },
    );
    await executeAction(payload);
  }

  if (!joined) {
    return (
      <main className="max-w-2xl">
        <header className="mb-7 grid gap-3">
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
            {t("P000192")}
          </p>
          <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("P000193")}
          </h1>
          <p
            className="m-0 flex items-center gap-2 text-sm text-[var(--muted)]"
            data-testid="connection-status"
          >
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${connected ? "bg-[var(--primary)]" : "bg-[var(--destructive)]"}`}
            />
            {connected ? t("P000194") : t("P000058")}
          </p>
        </header>
        <form
          className="rounded-2xl p-6 sm:p-8"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const details = {
              buyIn: Number(data.get("buyIn")),
            };
            joinDetailsRef.current = details;
            setPending(true);
            setError("");
            try {
              await restoreJoin(details);
            } catch {
              setError(t("P000176"));
            } finally {
              setPending(false);
            }
          }}
        >
          <label htmlFor="buyIn">
            {t("P000150")}
            <input
              className="min-h-11 border-[var(--border)] bg-[var(--background)] text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              id="buyIn"
              name="buyIn"
              type="number"
              min="1"
              defaultValue="500"
              required
            />
          </label>
          <Button
            className="mt-2"
            disabled={!connected}
            loading={pending}
            loadingText={t("P000196")}
            size="lg"
            type="submit"
          >
            {t("P000193")}
          </Button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </main>
    );
  }

  const tableView: TableViewModel | null = snapshot
    ? {
        tableId: snapshot.tableId,
        handId: snapshot.handId,
        phase: snapshot.phase,
        version: snapshot.version,
        viewerId: playerId ?? undefined,
        actorId: snapshot.actorId,
        currentBet: snapshot.currentBet,
        minimumRaise: snapshot.minimumRaise,
        seatCount: Math.max(
          2,
          ...snapshot.players.map((player) => player.seat + 1),
        ),
        buttonSeat: snapshot.buttonSeat,
        players: snapshot.players.map((player) => ({
          ...player,
          displayName:
            player.id === playerId
              ? t("P000066")
              : t("P000197", { 0: player.seat + 1 }),
        })),
        board: snapshot.board,
        holeCards: ownCards,
        legalActions: snapshot.legalActions,
        history: [
          t("P000198", { 0: snapshot.handId }),
          t("P000199", { 0: snapshot.phase, 1: snapshot.version }),
        ],
      }
    : null;
  const ownStack = snapshot?.players.find((player) => player.id === playerId)?.stack;
  const ownAward = playerId ? settlement?.awards[playerId] ?? 0 : 0;

  return (
    <main className="!w-full max-w-none px-2 sm:px-4" data-testid="table-state">
      <div className="row">
        <h1>{t("P000200")}</h1>
        <span data-testid="connection-status">
          {connected ? t("P000194") : t("P000058")}
        </span>
        <Button
          disabled={pending || snapshot?.phase !== "complete"}
          onClick={() =>
            void executeLeave(
              ClientLeaveSchema.parse({ roomId, actionId: actionId() }),
            )
          }
          variant="secondary"
        >
          {t("P000201")}
        </Button>
      </div>
      {snapshot?.phase === "complete" && settlement?.handId === snapshot.handId ? (
        <section
          className="mb-4 rounded-xl border border-[var(--primary)] bg-[var(--surface)] p-4 text-center"
          role="status"
        >
          <p className="m-0 text-lg font-semibold">
            {ownAward > 0
              ? `你赢了 ${ownAward} 筹码，对手本局失败`
              : "本局失败，对手赢得底池"}
          </p>
          <p className="mb-0 mt-1 text-sm text-[var(--muted)]">
            {ownStack !== undefined && ownStack < snapshot.minBuyIn
              ? "你的筹码不足，无法开始下一局。"
              : "等待其他玩家；5 秒后将自动开始下一局。"}
          </p>
        </section>
      ) : null}
      {retryOperation && (
        <Button
          disabled={pending}
          onClick={() =>
            void (retryOperation.kind === "action"
              ? executeAction(retryOperation.payload)
              : executeLeave(retryOperation.payload))
          }
          variant="secondary"
        >
          {t("P000202", {
            0: t(retryOperation.kind === "action" ? "P000232" : "P000233"),
          })}
        </Button>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && !tableView && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {tableView ? (
        <PokerTable
          actionDisabled={pending}
          connected={connected}
          error={error || undefined}
          onAction={(intent) => void submitAction(intent)}
          table={tableView}
        />
      ) : (
        <section className="panel">
          <p>{t("P000203")}</p>
        </section>
      )}
    </main>
  );
}
