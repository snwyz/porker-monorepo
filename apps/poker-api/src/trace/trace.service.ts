import { Injectable } from "@nestjs/common";
import { appendOperationTraceEvent } from "@poker/db";
import {
  traceMetadata,
  type TraceContext,
  type TraceEventInput,
} from "@poker/trace";

@Injectable()
export class TraceService {
  private readonly production = process.env.NODE_ENV === "production";
  private readonly disabled = process.env.POKER_TRACE_MODE === "off";

  record(context: TraceContext, input: TraceEventInput): void {
    if (this.disabled || (this.production && input.status !== "ERROR")) return;
    const sequence = context.sequence + 1;
    context.sequence = sequence;
    void appendOperationTraceEvent({
      traceId: context.traceId,
      sequence,
      operation: context.operation,
      stage: input.stage,
      status: input.status ?? "INFO",
      roomId: context.roomId,
      userId: context.userId,
      actionId: context.actionId,
      durationMs: input.durationMs,
      errorCode: input.errorCode,
      metadata: this.production
        ? undefined
        : input.metadata
          ? traceMetadata(input.metadata)
          : undefined,
    }).catch(() => undefined);
  }

  isQueryEnabled(): boolean {
    return !this.production && !this.disabled;
  }
}
