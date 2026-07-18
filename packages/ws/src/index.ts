import { createTraceContext, type TraceContext } from "@poker/trace";

type RequestFields = {
  actionId?: unknown;
  roomId?: unknown;
};

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Extracts only correlation identifiers; request bodies and credentials never enter traces. */
export function createSocketTraceContext(
  operation: string,
  raw: unknown,
): TraceContext {
  const fields =
    raw !== null && typeof raw === "object" ? (raw as RequestFields) : {};
  return createTraceContext({
    operation,
    roomId: stringField(fields.roomId),
    actionId: stringField(fields.actionId),
  });
}

export function withTraceUser(
  context: TraceContext,
  userId: string | undefined,
): TraceContext {
  return userId ? { ...context, userId } : context;
}
