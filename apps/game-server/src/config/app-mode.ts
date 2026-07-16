import { z } from "zod";

export const AppModeSchema = z.enum(["points", "web3"]);
export type AppMode = z.infer<typeof AppModeSchema>;

export function readAppMode(environment = process.env): AppMode {
  return AppModeSchema.parse(environment.APP_MODE);
}
