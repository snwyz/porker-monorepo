export type AgentEnvironment = Readonly<Record<string, string | undefined>>;

export type HttpResponse = {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
};

export type FetchLike = (
  url: URL,
  options: {
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
  },
) => Promise<HttpResponse>;

export type Completion = {
  readonly text: string;
};

export function requireApiKey(
  environment: AgentEnvironment,
  apiKeyEnvVar: string,
): string {
  const apiKey = environment[apiKeyEnvVar];
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error(`Missing API key in ${apiKeyEnvVar}`);
  }
  return apiKey;
}

export async function postJson(
  fetch: FetchLike,
  url: URL,
  headers: Readonly<Record<string, string>>,
  body: unknown,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Provider request failed with status ${response.status}`);
  }
  return JSON.parse(await response.text()) as unknown;
}

export function parseJsonResult(completion: Completion): unknown {
  try {
    return JSON.parse(completion.text) as unknown;
  } catch {
    throw new Error("Provider returned invalid JSON");
  }
}
