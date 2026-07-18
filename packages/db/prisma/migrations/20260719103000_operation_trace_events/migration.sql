CREATE TABLE "OperationTraceEvent" (
    "id" BIGSERIAL NOT NULL,
    "traceId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "roomId" TEXT,
    "userId" TEXT,
    "actionId" TEXT,
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationTraceEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationTraceEvent_traceId_sequence_key"
ON "OperationTraceEvent"("traceId", "sequence");

CREATE INDEX "OperationTraceEvent_roomId_occurredAt_idx"
ON "OperationTraceEvent"("roomId", "occurredAt");

CREATE INDEX "OperationTraceEvent_userId_occurredAt_idx"
ON "OperationTraceEvent"("userId", "occurredAt");

CREATE INDEX "OperationTraceEvent_actionId_idx"
ON "OperationTraceEvent"("actionId");

CREATE INDEX "OperationTraceEvent_occurredAt_idx"
ON "OperationTraceEvent"("occurredAt");
