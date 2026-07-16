import { z } from "zod";

import { ClientActionIdSchema, HandIdSchema, RoomIdSchema } from "./ids";

const base = {
  roomId: RoomIdSchema,
  handId: HandIdSchema,
  actionId: ClientActionIdSchema,
  expectedVersion: z.number().int().nonnegative(),
};

export const PlayerActionSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("fold") }),
  z.object({ ...base, type: z.literal("check") }),
  z.object({ ...base, type: z.literal("call") }),
  z.object({
    ...base,
    type: z.literal("bet"),
    amount: z.number().int().positive(),
  }),
  z.object({
    ...base,
    type: z.literal("raise"),
    amount: z.number().int().positive(),
  }),
]);

export type PlayerAction = z.infer<typeof PlayerActionSchema>;
