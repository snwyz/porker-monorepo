/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import type { AgentRequest, AgentResult } from "./agent.js";
import { parseAgentConfig, type AgentConfig } from "./config.js";
import type {
  AgentProvider,
  CodexAvailabilityProbe,
  ProviderId,
} from "./provider.js";

export type AgentRunReport = {
  readonly provider: ProviderId | undefined;
  readonly model: string | undefined;
  readonly fallbackReason: string | undefined;
  readonly duration: number;
  readonly status: "success" | "error";
};

type AgentRunnerOptions = {
  readonly config: AgentConfig;
  readonly providers: readonly AgentProvider[];
  readonly probeCodexCli?: CodexAvailabilityProbe;
  readonly report?: (report: AgentRunReport) => void;
};

export type AgentRunner = {
  run<T>(request: AgentRequest<T>): Promise<AgentResult<T>>;
};

const paidProviders = new Set<ProviderId>([
  "anthropic",
  "gemini",
  "openai-compatible",
]);

export function createAgentRunner(options: AgentRunnerOptions): AgentRunner {
  const config = parseAgentConfig(options.config);
  const providers = new Map(
    options.providers.map((provider) => [provider.id, provider]),
  );

  return {
    async run<T>(request: AgentRequest<T>): Promise<AgentResult<T>> {
      const startedAt = Date.now();
      let selectedProvider: SelectedProvider | undefined;
      let fallbackReason: string | undefined;

      try {
        selectedProvider = await selectProvider(
          request.provider,
          config,
          providers,
          options.probeCodexCli,
        );
        fallbackReason = selectedProvider.fallbackReason;
        const value = request.schema.parse(
          await selectedProvider.provider.execute({
            prompt: request.prompt,
            schema: request.schema,
          }),
        );
        const model =
          config.models[selectedProvider.provider.id] ??
          selectedProvider.provider.model;

        options.report?.({
          provider: selectedProvider.provider.id,
          model,
          fallbackReason,
          duration: Date.now() - startedAt,
          status: "success",
        });

        return {
          provider: selectedProvider.provider.id,
          model,
          value,
          ...(fallbackReason === undefined ? {} : { fallbackReason }),
        };
      } catch (error) {
        options.report?.({
          provider: selectedProvider?.provider.id,
          model: selectedProvider
            ? (config.models[selectedProvider.provider.id] ??
              selectedProvider.provider.model)
            : undefined,
          fallbackReason,
          duration: Date.now() - startedAt,
          status: "error",
        });
        throw error;
      }
    },
  };
}

type SelectedProvider = {
  readonly provider: AgentProvider;
  readonly fallbackReason?: string;
};

async function selectProvider(
  requestedProvider: ProviderId | "auto" | undefined,
  config: AgentConfig,
  providers: ReadonlyMap<ProviderId, AgentProvider>,
  probeCodexCli: CodexAvailabilityProbe | undefined,
): Promise<SelectedProvider> {
  if (requestedProvider !== undefined && requestedProvider !== "auto") {
    const provider = providers.get(requestedProvider);
    if (
      provider === undefined ||
      !(await isAvailable(provider, probeCodexCli))
    ) {
      throw new Error(`Provider ${requestedProvider} unavailable`);
    }
    return { provider };
  }

  let fallbackReason: string | undefined;
  for (const providerId of config.providerOrder) {
    const provider = providers.get(providerId);
    if (
      provider === undefined ||
      !(await isAvailable(provider, probeCodexCli))
    ) {
      fallbackReason = `${providerId} unavailable`;
      continue;
    }
    if (paidProviders.has(providerId) && !config.allowPaidFallback) {
      throw new Error("Paid fallback requires approval");
    }
    return {
      provider,
      ...(fallbackReason === undefined ? {} : { fallbackReason }),
    };
  }

  throw new Error("No available agent providers");
}

async function isAvailable(
  provider: AgentProvider,
  probeCodexCli: CodexAvailabilityProbe | undefined,
): Promise<boolean> {
  if (provider.id === "codex-cli" && probeCodexCli !== undefined) {
    return probeCodexCli();
  }
  return provider.isAvailable();
}
