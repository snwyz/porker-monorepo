import { z } from "zod";

export const RoomIdSchema = z.string().min(1).brand<"RoomId">();
export const HandIdSchema = z.string().min(1).brand<"HandId">();
export const PlayerIdSchema = z.string().min(1).brand<"PlayerId">();
export const ActionIdSchema = z.string().min(1).brand<"ActionId">();

export type RoomId = z.infer<typeof RoomIdSchema>;
export type HandId = z.infer<typeof HandIdSchema>;
export type PlayerId = z.infer<typeof PlayerIdSchema>;
export type ActionId = z.infer<typeof ActionIdSchema>;
