import { Prisma } from "@prisma/client";

import { prisma } from "./client.js";

export interface OperationTraceEventInput {
  traceId: string;
  sequence: number;
  operation: string;
  stage: string;
  status: string;
  roomId?: string;
  userId?: string;
  actionId?: string;
  durationMs?: number;
  errorCode?: string;
  metadata?: Record<string, boolean | number | string | null>;
}

export interface OperationTraceQuery {
  traceId?: string;
  roomId?: string;
  userId?: string;
  actionId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export async function appendOperationTraceEvent(
  input: OperationTraceEventInput,
): Promise<void> {
  await prisma.operationTraceEvent.create({
    data: {
      ...input,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listOperationTraceEvents(input: OperationTraceQuery) {
  return prisma.operationTraceEvent.findMany({
    where: {
      ...(input.traceId ? { traceId: input.traceId } : {}),
      ...(input.roomId ? { roomId: input.roomId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.actionId ? { actionId: input.actionId } : {}),
      ...(input.from || input.to
        ? {
            occurredAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ occurredAt: "asc" }, { sequence: "asc" }],
    take: Math.min(Math.max(input.limit ?? 100, 1), 200),
  });
}
