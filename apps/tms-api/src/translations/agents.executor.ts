import {
  createAgentRunner,
  createAnthropicProvider,
  createCodexCliProvider,
  createGeminiProvider,
  createOpenAICompatibleProvider,
  createTranslationPrompt,
  TranslationProposalsSchema,
  validateProposals,
  type AgentEnvironment,
  type AgentProvider,
  type ProviderId,
} from "@poker/agents";

import type { TranslationExecutor } from "./translations.service.js";

const paidProviders = new Set<ProviderId>([
  "anthropic",
  "gemini",
  "openai-compatible",
]);

type AgentTranslationExecutorOptions = {
  readonly environment?: AgentEnvironment;
  readonly providers?: readonly AgentProvider[];
};

export function createAgentTranslationExecutor(
  options: AgentTranslationExecutorOptions = {},
): TranslationExecutor {
  const environment = options.environment ?? process.env;
  const providers = options.providers ?? createProductionProviders(environment);

  return {
    async translate({ entries, provider, approvePaidFallback = false }) {
      if (provider !== "auto" && paidProviders.has(provider) && !approvePaidFallback) {
        throw new Error("Paid provider requires explicit confirmation");
      }
      const runner = createAgentRunner({
        config: {
          allowPaidFallback: approvePaidFallback,
          models: {},
          providerOrder: providers.map((candidate) => candidate.id),
        },
        providers,
      });
      const agentEntries = entries.map((entry) => ({
        ...entry,
        code: entry.code as `P${number}`,
      }));
      const result = await runner.run({
        prompt: createTranslationPrompt(agentEntries),
        provider,
        schema: TranslationProposalsSchema,
      });

      return {
        model: result.model,
        proposals: validateProposals(agentEntries, result.value),
        provider: result.provider,
      };
    },
  };
}

function createProductionProviders(
  environment: AgentEnvironment,
): readonly AgentProvider[] {
  const fetch = (url: URL, request: Parameters<typeof globalThis.fetch>[1]) =>
    globalThis.fetch(url, request);
  const providers: AgentProvider[] = [
    createAnthropicProvider({
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      env: environment,
      fetch,
    }),
    createGeminiProvider({
      apiKeyEnvVar: "GEMINI_API_KEY",
      env: environment,
      fetch,
    }),
  ];
  const codexExecutable = environment.POKER_CODEX_EXECUTABLE;
  if (codexExecutable !== undefined && codexExecutable.length > 0) {
    providers.unshift(
      createCodexCliProvider({ executable: codexExecutable, env: environment }),
    );
  }
  const openAiBaseUrl = environment.OPENAI_COMPATIBLE_BASE_URL;
  if (openAiBaseUrl !== undefined && openAiBaseUrl.length > 0) {
    providers.push(
      createOpenAICompatibleProvider({
        apiKeyEnvVar: "OPENAI_COMPATIBLE_API_KEY",
        baseUrl: openAiBaseUrl,
        env: environment,
        fetch,
      }),
    );
  }
  return providers;
}
