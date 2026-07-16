ALTER TABLE "TableOperation" ADD COLUMN "handId" TEXT;

INSERT INTO "TableOperation" (
  "actionId", "roomId", "userId", "type", "handId", "payloadHash", "ack", "createdAt"
)
SELECT
  event."actionId",
  COALESCE(event."actionRoomId", hand."roomId"),
  COALESCE(event."actorUserId", ''),
  'ACTION',
  event."handId",
  COALESCE(event."actionPayloadHash", ''),
  event."ack",
  event."createdAt"
FROM "HandEvent" event
JOIN "Hand" hand ON hand."id" = event."handId"
WHERE event."actionId" IS NOT NULL AND event."ack" IS NOT NULL
ON CONFLICT ("actionId") DO NOTHING;
