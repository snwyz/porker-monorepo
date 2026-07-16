import { io, type Socket } from "socket.io-client";
import { z } from "zod";

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
  | { ok: true; [key: string]: unknown }
  | { ok: false; code: string; version?: number };

export function createTableSocket(): Socket {
  return io(
    process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://127.0.0.1:3001",
    { transports: ["websocket"], withCredentials: true },
  );
}

export function emitAck<T extends Ack>(
  socket: Socket,
  event: string,
  payload: unknown,
) {
  return new Promise<T>((resolve, reject) => {
    socket
      .timeout(8_000)
      .emit(event, payload, (error: Error | null, ack: T) => {
        if (error) reject(error);
        else resolve(ack);
      });
  });
}
