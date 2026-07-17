import { z } from "zod";

import { providerIds, type ProviderId } from "./provider.js";

export const ProviderIdSchema = z.enum(providerIds);

export const AgentConfigSchema = z.object({
  providerOrder: z.array(ProviderIdSchema).min(1),
  allowPaidFallback: z.boolean(),
  models: z.partialRecord(ProviderIdSchema, z.string().min(1)),
});

export type AgentConfig = {
  readonly providerOrder: readonly ProviderId[];
  readonly allowPaidFallback: boolean;
  readonly models: Partial<Record<ProviderId, string>>;
};

export function parseAgentConfig(config: unknown): AgentConfig {
  return AgentConfigSchema.parse(config);
}
