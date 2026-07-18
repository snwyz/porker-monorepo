import { Controller, Get, NotFoundException, Query } from "@nestjs/common";
import { listOperationTraceEvents } from "@poker/db";

import { TraceService } from "./trace.service.js";

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalDate(value: unknown): Date | undefined {
  const text = optionalString(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function optionalLimit(value: unknown): number | undefined {
  const text = optionalString(value);
  if (!text) return undefined;
  const number = Number(text);
  return Number.isInteger(number) ? number : undefined;
}

@Controller("dev/traces")
export class TraceController {
  constructor(private readonly traces: TraceService) {}

  @Get()
  async list(@Query() query: Record<string, unknown>) {
    if (!this.traces.isQueryEnabled()) throw new NotFoundException();
    const events = await listOperationTraceEvents({
      traceId: optionalString(query.traceId),
      roomId: optionalString(query.roomId),
      userId: optionalString(query.userId),
      actionId: optionalString(query.actionId),
      from: optionalDate(query.from),
      to: optionalDate(query.to),
      limit: optionalLimit(query.limit),
    });
    return {
      events: events.map((event) => ({ ...event, id: event.id.toString() })),
    };
  }
}
