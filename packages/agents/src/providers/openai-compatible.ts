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

export type OpenAICompatibleProviderOptions = {
  readonly baseUrl: string;
  readonly apiKeyEnvVar: string;
  readonly env: AgentEnvironment;
  readonly fetch: FetchLike;
  readonly model?: string;
  readonly isTestEnvironment?: boolean;
};

export type OpenAICompatibleProvider = AgentProvider & {
  complete(request: ProviderRequest): Promise<Completion>;
};

export function createOpenAICompatibleProvider(
  options: OpenAICompatibleProviderOptions,
): OpenAICompatibleProvider {
  const baseUrl = new URL(options.baseUrl);
  if (baseUrl.protocol !== "https:" && !options.isTestEnvironment) {
    throw new Error("OpenAI-compatible base URL must use HTTPS");
  }
  const model = options.model ?? "gpt-4.1";

  return {
    id: "openai-compatible",
    model,
    async isAvailable(): Promise<boolean> {
      return hasApiKey(options.env, options.apiKeyEnvVar);
    },
    async complete(request: ProviderRequest): Promise<Completion> {
      const response = await postJson(
        options.fetch,
        new URL("chat/completions", ensureTrailingSlash(baseUrl)),
        {
          "content-type": "application/json",
          authorization: `Bearer ${requireApiKey(options.env, options.apiKeyEnvVar)}`,
        },
        {
          model,
          messages: [{ role: "user", content: request.prompt }],
        },
      );
      return { text: openAIText(response) };
    },
    async execute(request: ProviderRequest): Promise<unknown> {
      return parseJsonResult(await this.complete(request));
    },
  };
}

function ensureTrailingSlash(url: URL): URL {
  return new URL(url.pathname.endsWith("/") ? url.href : `${url.href}/`);
}

function hasApiKey(
  environment: AgentEnvironment,
  variableName: string,
): boolean {
  const key = environment[variableName];
  return key !== undefined && key.length > 0;
}

function openAIText(response: unknown): string {
  const choices = (response as { choices?: unknown }).choices;
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined;
  const message = (firstChoice as { message?: unknown } | undefined)?.message;
  const content = (message as { content?: unknown } | undefined)?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI-compatible response did not contain text");
  }
  return content;
}
