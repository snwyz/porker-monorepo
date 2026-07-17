/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { access } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { spawn } from "node:child_process";

import type { AgentProvider, ProviderRequest } from "../provider.js";

import {
  parseJsonResult,
  type AgentEnvironment,
  type Completion,
} from "./http.js";

export type CommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type ExecuteCommand = (
  executable: string,
  args: readonly string[],
  options: { readonly env: AgentEnvironment },
) => Promise<CommandResult>;

export type CodexCliProviderOptions = {
  readonly executable: string;
  readonly model?: string;
  readonly env?: AgentEnvironment;
  readonly availability?: (executable: string) => Promise<boolean>;
  readonly executeCommand?: ExecuteCommand;
};

export type CodexCliProvider = AgentProvider & {
  complete(request: ProviderRequest): Promise<Completion>;
};

export function createCodexCliProvider(
  options: CodexCliProviderOptions,
): CodexCliProvider {
  if (!isAbsolute(options.executable)) {
    throw new Error("Codex executable must be an absolute local path");
  }

  const env = options.env ?? process.env;
  const availability = options.availability ?? defaultAvailability;
  const executeCommand = options.executeCommand ?? defaultExecuteCommand;

  return {
    id: "codex-cli",
    model: options.model ?? "codex-cli",
    isAvailable: () => availability(options.executable),
    async complete(request: ProviderRequest): Promise<Completion> {
      const result = await executeCommand(
        options.executable,
        ["exec", "--json", request.prompt],
        { env },
      );
      if (result.exitCode !== 0) {
        throw new Error("Codex CLI execution failed");
      }
      return { text: result.stdout };
    },
    async execute(request: ProviderRequest): Promise<unknown> {
      return parseJsonResult(await this.complete(request));
    },
  };
}

async function defaultAvailability(executable: string): Promise<boolean> {
  try {
    await access(executable);
    return true;
  } catch {
    return false;
  }
}

function defaultExecuteCommand(
  executable: string,
  args: readonly string[],
  options: { readonly env: AgentEnvironment },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}
