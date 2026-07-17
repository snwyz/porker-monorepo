/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import type { AgentProvider, ProviderRequest } from "../provider.js";

import {
  parseJsonResult,
  postJson,
  requireApiKey,
  type AgentEnvironment,
  type Completion,
  type FetchLike,
} from "./http.js";

export type GeminiProviderOptions = {
  readonly apiKeyEnvVar: string;
  readonly env: AgentEnvironment;
  readonly fetch: FetchLike;
  readonly model?: string;
};

export type GeminiProvider = AgentProvider & {
  complete(request: ProviderRequest): Promise<Completion>;
};

export function createGeminiProvider(
  options: GeminiProviderOptions,
): GeminiProvider {
  const model = options.model ?? "gemini-2.5-pro";
  return {
    id: "gemini",
    model,
    async isAvailable(): Promise<boolean> {
      return hasApiKey(options.env, options.apiKeyEnvVar);
    },
    async complete(request: ProviderRequest): Promise<Completion> {
      const response = await postJson(
        options.fetch,
        new URL(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        ),
        {
          "content-type": "application/json",
          "x-goog-api-key": requireApiKey(options.env, options.apiKeyEnvVar),
        },
        {
          contents: [{ parts: [{ text: request.prompt }] }],
        },
      );
      return { text: geminiText(response) };
    },
    async execute(request: ProviderRequest): Promise<unknown> {
      return parseJsonResult(await this.complete(request));
    },
  };
}

function hasApiKey(
  environment: AgentEnvironment,
  variableName: string,
): boolean {
  const key = environment[variableName];
  return key !== undefined && key.length > 0;
}

function geminiText(response: unknown): string {
  const candidates = (response as { candidates?: unknown }).candidates;
  const firstCandidate = Array.isArray(candidates) ? candidates[0] : undefined;
  const content = (firstCandidate as { content?: unknown } | undefined)
    ?.content;
  const parts = (content as { parts?: unknown } | undefined)?.parts;
  const firstPart = Array.isArray(parts) ? parts[0] : undefined;
  const text = (firstPart as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string") {
    throw new Error("Gemini response did not contain text");
  }
  return text;
}
