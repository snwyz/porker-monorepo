import { io, type Socket } from "socket.io-client";
import {
  normalizeLocale,
  t,
  type Locale,
  type MessageCode,
  type MessageParams,
} from "@poker/i18n";
import { z } from "zod";

import { readLocaleCookie } from "@poker/next-i18n/browser";

const ClientActionIdSchema = z
  .string()
  .min(1)
  .refine((id) => !id.startsWith("server:"));
const ActionBaseSchema = z.object({
  roomId: z.string().min(1),
  handId: z.string().min(1),
  actionId: ClientActionIdSchema,
  expectedVersion: z.number().int().nonnegative(),
});

export const ClientPlayerActionSchema = z.discriminatedUnion("type", [
  ActionBaseSchema.extend({ type: z.literal("fold") }),
  ActionBaseSchema.extend({ type: z.literal("check") }),
  ActionBaseSchema.extend({ type: z.literal("call") }),
  ActionBaseSchema.extend({
    type: z.literal("bet"),
    amount: z.number().int().positive(),
  }),
  ActionBaseSchema.extend({
    type: z.literal("raise"),
    amount: z.number().int().positive(),
  }),
]);

export const ClientLeaveSchema = z.object({
  roomId: z.string().min(1),
  actionId: ClientActionIdSchema,
});

export type ClientPlayerAction = z.infer<typeof ClientPlayerActionSchema>;

export type Ack =
  | { ok: true; traceId?: string; [key: string]: unknown }
  | {
      ok: false;
      code: MessageCode;
      params?: MessageParams;
      version?: number;
      traceId?: string;
    };

function currentLocale(): Locale {
  if (typeof document === "undefined") return "en";
  return readLocaleCookie() ?? normalizeLocale(navigator.language);
}

export function formatAckError(
  ack: Extract<Ack, { ok: false }>,
  locale = currentLocale(),
): string {
  const traceSuffix = ack.traceId ? `（追踪 ID：${ack.traceId}）` : "";
  try {
    return `${t(locale, ack.code, ack.params)}${traceSuffix}`;
  } catch {
    return `${t(locale, "P000172")}${traceSuffix}`;
  }
}

export function createTableSocket(): Socket {
  return io(
    typeof window === "undefined" ? undefined : window.location.origin,
    {
      path: "/socket.io",
      transports: ["websocket"],
      withCredentials: true,
    },
  );
}

export function emitAck<T extends Ack>(
  socket: Socket,
  event: string,
  payload: unknown,
  attempts = 2,
) {
  return new Promise<T>((resolve, reject) => {
    const send = (remaining: number) => {
      socket
        .timeout(8_000)
        .emit(event, payload, (error: Error | null, ack: T) => {
          if (!error) resolve(ack);
          else if (remaining > 1) send(remaining - 1);
          else reject(error);
        });
    };
    send(Math.max(1, attempts));
  });
}
