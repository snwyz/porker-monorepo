import { z } from "zod";
import { RoomIdSchema } from "./ids";
import { ActionIdSchema } from "./ids";

export const TableJoinSchema = z.object({
  roomId: RoomIdSchema,
  seat: z.number().int().nonnegative(),
  buyIn: z.number().int().positive(),
  sinceVersion: z.number().int().nonnegative().optional(),
});
export const TableRoomRequestSchema = z.object({ roomId: RoomIdSchema });
export const TableLeaveSchema = z.object({
  roomId: RoomIdSchema,
  actionId: ActionIdSchema,
});
