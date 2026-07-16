import { z } from "zod";

const chipAmount = z.number().int().positive().safe();

export const CreateRoomSchema = z
  .object({
    name: z.string().trim().min(1).max(48),
    seats: z.number().int().min(2).max(9),
    smallBlind: chipAmount,
    bigBlind: chipAmount,
    minBuyIn: chipAmount,
    maxBuyIn: chipAmount,
    actionTimeoutSeconds: z.number().int().min(10).max(120),
  })
  .refine(({ smallBlind, bigBlind }) => smallBlind < bigBlind, {
    message: "smallBlind must be less than bigBlind",
    path: ["smallBlind"],
  })
  .refine(({ bigBlind, minBuyIn }) => bigBlind <= minBuyIn, {
    message: "bigBlind must not exceed minBuyIn",
    path: ["minBuyIn"],
  })
  .refine(({ minBuyIn, maxBuyIn }) => minBuyIn <= maxBuyIn, {
    message: "minBuyIn must not exceed maxBuyIn",
    path: ["maxBuyIn"],
  });

export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
