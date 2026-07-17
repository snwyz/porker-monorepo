import type { z } from "zod";

export const providerIds = [
  "codex-cli",
  "anthropic",
  "gemini",
  "openai-compatible",
] as const;

export type ProviderId = (typeof providerIds)[number];

export type ProviderRequest = {
  readonly prompt: string;
  readonly schema: z.ZodType;
};

export type AgentProvider = {
  readonly id: ProviderId;
  readonly model: string;
  isAvailable(): Promise<boolean>;
  execute(request: ProviderRequest): Promise<unknown>;
};

export type CodexAvailabilityProbe = () => Promise<boolean>;
