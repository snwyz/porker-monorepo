import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { providerIds, type ProviderId } from "./provider.js";

type TranslationPreparation = {
  readonly provider: ProviderId;
  readonly model: string;
  readonly itemCount: number;
  readonly requiresPaidFallback: boolean;
  execute(): Promise<unknown>;
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

      if (
        preparation.requiresPaidFallback &&
        !command.approvePaidFallback &&
        !(await dependencies.confirm(paidFallbackPrompt(preparation)))
      ) {
        throw new Error("Paid fallback was not approved");
      }

      dependencies.stdout(
        `provider=${preparation.provider} model=${preparation.model} items=${preparation.itemCount}\n`,
      );
      const result = await preparation.execute();
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

export function createDefaultAgentsCli(): AgentsCli {
  return createAgentsCli({
    readFile: (path) => readFile(path, "utf8"),
    writeFile: (path, content) => writeFile(path, content, "utf8"),
    stdout: (line) => stdout.write(line),
    confirm: confirmPaidFallback,
    prepareTranslation: async () => {
      throw new Error("Translation agent is not installed");
    },
  });
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
