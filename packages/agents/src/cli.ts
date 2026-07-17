import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  createTranslationJob,
  createTranslationPrompt,
  parseTranslationEntries,
  TranslationProposalsSchema,
} from "./agents/translation/index.js";
import type { AgentProvider } from "./provider.js";
import { providerIds, type ProviderId } from "./provider.js";
import { createAgentRunner } from "./runner.js";
import {
  createAnthropicProvider,
  createCodexCliProvider,
  createGeminiProvider,
  createOpenAICompatibleProvider,
} from "./providers/index.js";

type TranslationPreparation = {
  readonly provider: ProviderId;
  readonly model: string;
  readonly itemCount: number;
  readonly requiresPaidFallback: boolean;
  execute(allowPaidFallback: boolean): Promise<unknown>;
};

type TranslationOptions = {
  readonly input: string;
  readonly provider: ProviderId | "auto";
};

export type AgentsCliDependencies = {
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, content: string) => Promise<void>;
  readonly stdout: (line: string) => void;
  readonly confirm: (prompt: string) => Promise<boolean>;
  readonly prepareTranslation: (
    options: TranslationOptions,
  ) => Promise<TranslationPreparation>;
};

export type AgentsCli = {
  run(argv: readonly string[]): Promise<void>;
};

export function createAgentsCli(
  dependencies: AgentsCliDependencies,
): AgentsCli {
  return {
    async run(argv: readonly string[]): Promise<void> {
      const command = parseCommand(argv);
      const input = await dependencies.readFile(command.inputPath);
      const preparation = await dependencies.prepareTranslation({
        input,
        provider: command.provider,
      });

      let allowPaidFallback = command.approvePaidFallback;
      if (preparation.requiresPaidFallback && !allowPaidFallback) {
        allowPaidFallback = await dependencies.confirm(
          paidFallbackPrompt(preparation),
        );
        if (!allowPaidFallback) {
          throw new Error("Paid fallback was not approved");
        }
      }

      dependencies.stdout(
        `provider=${preparation.provider} model=${preparation.model} items=${preparation.itemCount}\n`,
      );
      const result = await preparation.execute(allowPaidFallback);
      await dependencies.writeFile(
        command.outputPath,
        `${JSON.stringify(result, null, 2)}\n`,
      );
    },
  };
}

type ParsedCommand = {
  readonly provider: ProviderId | "auto";
  readonly inputPath: string;
  readonly outputPath: string;
  readonly approvePaidFallback: boolean;
};

function parseCommand(argv: readonly string[]): ParsedCommand {
  if (argv[0] !== "run" || argv[1] !== "translation") {
    throw new Error(
      "Usage: agents run translation --input <path> --output <path>",
    );
  }

  const flags = parseFlags(argv.slice(2));
  const inputPath = flags.get("--input");
  const outputPath = flags.get("--output");
  if (inputPath === undefined) {
    throw new Error("An explicit --input path is required");
  }
  if (outputPath === undefined) {
    throw new Error("An explicit --output path is required");
  }
  const provider = flags.get("--provider") ?? "auto";
  if (provider !== "auto" && !providerIds.includes(provider as ProviderId)) {
    throw new Error(`Unknown provider ${provider}`);
  }

  return {
    provider: provider as ProviderId | "auto",
    inputPath,
    outputPath,
    approvePaidFallback: flags.has("--approve-paid-fallback"),
  };
}

function parseFlags(argv: readonly string[]): ReadonlyMap<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--approve-paid-fallback") {
      flags.set(flag, "true");
      continue;
    }
    if (flag !== "--provider" && flag !== "--input" && flag !== "--output") {
      throw new Error(`Unknown argument ${flag ?? ""}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    flags.set(flag, value);
    index += 1;
  }
  return flags;
}

function paidFallbackPrompt(preparation: TranslationPreparation): string {
  return `Use paid fallback ${preparation.provider}/${preparation.model} for ${preparation.itemCount} items?`;
}

export type DefaultAgentsCliOptions = Partial<
  Omit<AgentsCliDependencies, "prepareTranslation">
> & {
  readonly providers?: readonly AgentProvider[];
  readonly createRunner?: typeof createAgentRunner;
  readonly environment?: NodeJS.ProcessEnv;
};

export function createDefaultAgentsCli(
  options: DefaultAgentsCliOptions = {},
): AgentsCli {
  const providers =
    options.providers ?? createDefaultProviders(options.environment);
  const createRunner = options.createRunner ?? createAgentRunner;

  return createAgentsCli({
    readFile: options.readFile ?? ((path) => readFile(path, "utf8")),
    writeFile:
      options.writeFile ??
      ((path, content) => writeFile(path, content, "utf8")),
    stdout: options.stdout ?? ((line) => stdout.write(line)),
    confirm: options.confirm ?? confirmPaidFallback,
    prepareTranslation: (translation) =>
      prepareDefaultTranslation(translation, providers, createRunner),
  });
}

async function prepareDefaultTranslation(
  options: TranslationOptions,
  providers: readonly AgentProvider[],
  createRunner: typeof createAgentRunner,
): Promise<TranslationPreparation> {
  const entries = parseTranslationEntries(options.input);
  const selectedProvider = await selectCliProvider(options.provider, providers);
  const itemCount = entries.length;
  return {
    provider: selectedProvider.id,
    model: selectedProvider.model,
    itemCount,
    requiresPaidFallback: isPaidProvider(selectedProvider.id),
    async execute(allowPaidFallback: boolean): Promise<unknown> {
      const runner = createRunner({
        config: {
          providerOrder: providers.map((provider) => provider.id),
          allowPaidFallback,
          models: {},
        },
        providers,
      });
      const result = await runner.run({
        prompt: createTranslationPrompt(entries),
        schema: TranslationProposalsSchema,
        provider: options.provider,
      });
      return createTranslationJob({
        entries,
        proposals: result.value,
        provider: result.provider,
        model: result.model,
      });
    },
  };
}

async function selectCliProvider(
  requestedProvider: ProviderId | "auto",
  providers: readonly AgentProvider[],
): Promise<AgentProvider> {
  const candidates =
    requestedProvider === "auto"
      ? [
          ...providers.filter((provider) => provider.id === "codex-cli"),
          ...providers.filter((provider) => provider.id !== "codex-cli"),
        ]
      : providers.filter((provider) => provider.id === requestedProvider);

  for (const provider of candidates) {
    if (await provider.isAvailable()) {
      return provider;
    }
  }

  if (requestedProvider !== "auto") {
    throw new Error(`Provider ${requestedProvider} unavailable`);
  }
  throw new Error("No available agent providers");
}

function isPaidProvider(provider: ProviderId): boolean {
  return provider !== "codex-cli";
}

function createDefaultProviders(
  environment: NodeJS.ProcessEnv | undefined,
): readonly AgentProvider[] {
  const env = environment ?? process.env;
  const fetch = (url: URL, request: Parameters<typeof globalThis.fetch>[1]) =>
    globalThis.fetch(url, request);
  const providers: AgentProvider[] = [
    createAnthropicProvider({
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      env,
      fetch,
    }),
    createGeminiProvider({
      apiKeyEnvVar: "GEMINI_API_KEY",
      env,
      fetch,
    }),
  ];
  const codexExecutable = env.POKER_CODEX_EXECUTABLE;
  if (codexExecutable !== undefined && codexExecutable.length > 0) {
    providers.unshift(
      createCodexCliProvider({ executable: codexExecutable, env }),
    );
  }
  const openAiBaseUrl = env.OPENAI_COMPATIBLE_BASE_URL;
  if (openAiBaseUrl !== undefined && openAiBaseUrl.length > 0) {
    providers.push(
      createOpenAICompatibleProvider({
        baseUrl: openAiBaseUrl,
        apiKeyEnvVar: "OPENAI_COMPATIBLE_API_KEY",
        env,
        fetch,
      }),
    );
  }
  return providers;
}

async function confirmPaidFallback(prompt: string): Promise<boolean> {
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await readline.question(`${prompt} [y/N] `);
    return answer.trim().toLowerCase() === "y";
  } finally {
    readline.close();
  }
}

if (process.argv[1]?.endsWith("/cli.js")) {
  void createDefaultAgentsCli().run(process.argv.slice(2));
}
