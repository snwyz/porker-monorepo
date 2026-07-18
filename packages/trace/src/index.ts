import { randomUUID } from "node:crypto";

export type TraceStatus = "OK" | "ERROR" | "INFO";

export interface TraceContext {
  traceId: string;
  sequence: number;
  operation: string;
  roomId?: string;
  userId?: string;
  actionId?: string;
}

export interface TraceEventInput {
  stage: string;
  status?: TraceStatus;
  durationMs?: number;
  errorCode?: string;
  metadata?: Readonly<Record<string, boolean | number | string | null>>;
}

export function createTraceContext(
  input: Omit<TraceContext, "traceId" | "sequence">,
): TraceContext {
  return { traceId: randomUUID(), sequence: 0, ...input };
}

export function traceMetadata(
  metadata: Readonly<Record<string, boolean | number | string | null | undefined>>,
): Record<string, boolean | number | string | null> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  ) as Record<string, boolean | number | string | null>;
}
