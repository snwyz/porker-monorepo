import type { z } from "zod";

import type { ProviderId } from "./provider.js";

export type AgentRequest<T> = {
  readonly prompt: string;
  readonly schema: z.ZodType<T>;
  readonly provider?: ProviderId | "auto";
};

export type AgentResult<T> = {
  readonly provider: ProviderId;
  readonly model: string;
  readonly value: T;
  readonly fallbackReason?: string;
};
