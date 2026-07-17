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

export type AnthropicProviderOptions = {
  readonly apiKeyEnvVar: string;
  readonly env: AgentEnvironment;
  readonly fetch: FetchLike;
  readonly model?: string;
};

export type AnthropicProvider = AgentProvider & {
  complete(request: ProviderRequest): Promise<Completion>;
};

export function createAnthropicProvider(
  options: AnthropicProviderOptions,
): AnthropicProvider {
  return {
    id: "anthropic",
    model: options.model ?? "claude-sonnet-4-5",
    async isAvailable(): Promise<boolean> {
      return hasApiKey(options.env, options.apiKeyEnvVar);
    },
    async complete(request: ProviderRequest): Promise<Completion> {
      const response = await postJson(
        options.fetch,
        new URL("https://api.anthropic.com/v1/messages"),
        {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": requireApiKey(options.env, options.apiKeyEnvVar),
        },
        {
          model: options.model ?? "claude-sonnet-4-5",
          max_tokens: 4096,
          messages: [{ role: "user", content: request.prompt }],
        },
      );
      return { text: anthropicText(response) };
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

function anthropicText(response: unknown): string {
  const content = (response as { content?: unknown }).content;
  const first = Array.isArray(content) ? content[0] : undefined;
  const text = (first as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string") {
    throw new Error("Anthropic response did not contain text");
  }
  return text;
}
