import { describe, expect, it, vi } from "vitest";

import type { ProviderRequest } from "../provider.js";
import {
  createAnthropicProvider,
  createCodexCliProvider,
  createGeminiProvider,
  createOpenAICompatibleProvider,
} from "./index.js";
import * as providers from "./index.js";

const request: ProviderRequest = {
  prompt: "Translate this entry",
  schema: {
    parse: (value: unknown) => value,
  } as ProviderRequest["schema"],
};

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

describe("provider adapters", () => {
  it("reports Codex CLI availability through its injected probe", async () => {
    const availability = vi.fn().mockResolvedValue(true);
    const codex = createCodexCliProvider({
      executable: "/usr/local/bin/codex",
      availability,
      executeCommand: vi.fn(),
    });

    await expect(codex.isAvailable()).resolves.toBe(true);
    expect(availability).toHaveBeenCalledWith("/usr/local/bin/codex");
  });

  it("executes Codex only through the configured executable with inherited authentication", async () => {
    const executeCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout:
        '{"type":"item.completed","item":{"type":"agent_message","text":"{}"}}',
      stderr: "",
    });
    const env = { CODEX_AUTH_TOKEN: "local-token" };
    const codex = createCodexCliProvider({
      executable: "/usr/local/bin/codex",
      availability: vi.fn().mockResolvedValue(true),
      executeCommand,
      env,
    });

    await expect(codex.complete(request)).resolves.toEqual({ text: "{}" });
    expect(executeCommand).toHaveBeenCalledWith(
      "/usr/local/bin/codex",
      ["exec", "--json", "Translate this entry"],
      { env },
    );
  });

  it("extracts the final agent message from Codex JSONL output", async () => {
    const codex = createCodexCliProvider({
      executable: "/usr/local/bin/codex",
      executeCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: [
          '{"type":"thread.started","thread_id":"thread-1"}',
          '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"value\\":1}"}}',
          '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"value\\":2}"}}',
        ].join("\n"),
        stderr: "",
      }),
    });

    await expect(codex.complete(request)).resolves.toEqual({
      text: '{"value":2}',
    });
  });

  it("rejects Codex JSONL output without a completed agent message", async () => {
    const codex = createCodexCliProvider({
      executable: "/usr/local/bin/codex",
      executeCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '{"type":"thread.started","thread_id":"thread-1"}',
        stderr: "",
      }),
    });

    await expect(codex.complete(request)).rejects.toThrow(
      "Codex CLI returned invalid JSONL",
    );
  });

  it("sends Anthropic requests with an injected transport and returns JSON text", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: [{ text: "{}" }] }));
    const anthropic = createAnthropicProvider({
      apiKeyEnvVar: "TEST_ANTHROPIC_KEY",
      env: { TEST_ANTHROPIC_KEY: "test-key" },
      fetch: fakeFetch,
    });

    await expect(anthropic.complete(request)).resolves.toEqual({ text: "{}" });
    expect(fakeFetch).toHaveBeenCalledWith(
      new URL("https://api.anthropic.com/v1/messages"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "test-key",
        }),
      }),
    );
  });

  it("uses Gemini's configured environment-variable key without logging credentials", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "{}" }] } }],
      }),
    );
    const gemini = createGeminiProvider({
      apiKeyEnvVar: "TEST_GEMINI_KEY",
      env: { TEST_GEMINI_KEY: "test-key" },
      fetch: fakeFetch,
    });

    await expect(gemini.complete(request)).resolves.toEqual({ text: "{}" });
    const requestOptions = fakeFetch.mock.calls[0]?.[1] as {
      headers: Record<string, string>;
    };
    expect(requestOptions.headers).toEqual(
      expect.objectContaining({ "x-goog-api-key": "test-key" }),
    );
    expect(JSON.stringify(fakeFetch.mock.calls)).not.toContain("console");
  });

  it("rejects insecure OpenAI-compatible base URLs outside tests", () => {
    expect(() =>
      createOpenAICompatibleProvider({
        baseUrl: "http://localhost:8080/v1",
        apiKeyEnvVar: "TEST_OPENAI_KEY",
        env: { TEST_OPENAI_KEY: "test-key" },
        fetch: vi.fn(),
      }),
    ).toThrow("OpenAI-compatible base URL must use HTTPS");
  });

  it("does not expose an insecure HTTP provider factory from the production API", () => {
    expect(providers).not.toHaveProperty(
      "createOpenAICompatibleProviderForTest",
    );
  });

  it("returns OpenAI-compatible content through an injected transport in tests", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: "{}" } }] }),
      );
    const provider = createOpenAICompatibleProvider({
      baseUrl: "https://provider.test/v1",
      apiKeyEnvVar: "TEST_OPENAI_KEY",
      env: { TEST_OPENAI_KEY: "test-key" },
      fetch: fakeFetch,
    });

    await expect(provider.complete(request)).resolves.toEqual({ text: "{}" });
  });
});
