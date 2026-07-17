const { randomUUID } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { isDeepStrictEqual } = require("node:util");
const { io } = require("socket.io-client");

let tableSequence = 0;

function metric(events, type, name, value) {
  events.emit(type, name, value);
}

async function requestJson(target, path, body) {
  const response = await fetch(`${target}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return { body: await response.json(), headers: response.headers };
}

function sessionCookie(headers) {
  const cookie = headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Guest session did not set a cookie");
  return cookie;
}

function connect(target, cookie) {
  return new Promise((resolve, reject) => {
    const socket = io(target, {
      path: "/socket.io",
      transports: ["websocket"],
      extraHeaders: { Cookie: cookie },
      forceNew: true,
      reconnection: false,
      timeout: 5_000,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Socket.IO connection timeout"));
    }, 5_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function emitAck(socket, channel, payload, events) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const timer = setTimeout(
      () => reject(new Error(`Ack timeout for ${channel}`)),
      5_000,
    );
    socket.emit(channel, payload, (ack) => {
      clearTimeout(timer);
      metric(
        events,
        "histogram",
        "poker.ack_ms",
        performance.now() - startedAt,
      );
      resolve(ack);
    });
  });
}

async function recordServerEventLoopLag(target, events) {
  const response = await fetch(`${target}/health/event-loop`);
  if (!response.ok) throw new Error("Game-server lag probe failed");
  const sample = await response.json();
  metric(events, "histogram", "poker.event_loop_lag_ms", sample.lagMs);
}

function actionFrom(snapshot, roomId) {
  const legal =
    snapshot.legalActions.find((action) => action.type === "check") ??
    snapshot.legalActions.find((action) => action.type === "call") ??
    snapshot.legalActions.find((action) => action.type === "bet") ??
    snapshot.legalActions.find((action) => action.type === "raise") ??
    snapshot.legalActions[0];
  if (!legal) return null;
  const action = {
    roomId,
    handId: snapshot.handId,
    actionId: randomUUID(),
    expectedVersion: snapshot.version,
    type: legal.type,
  };
  if (legal.type === "bet" || legal.type === "raise") {
    action.amount = legal.minAmount;
  }
  return action;
}

async function playLegalActions(target, roomId, players, events) {
  let duplicateChecked = false;
  for (let step = 0; step < 16; step += 1) {
    let actor = null;
    let snapshot = null;
    for (const player of players) {
      const response = await emitAck(
        player,
        "table:snapshot",
        { roomId },
        events,
      );
      if (response.ok && response.snapshot.legalActions.length > 0) {
        actor = player;
        snapshot = response.snapshot;
        break;
      }
    }
    if (!actor || !snapshot || snapshot.phase === "complete") return;
    const action = actionFrom(snapshot, roomId);
    if (!action) return;
    const first = await emitAck(actor, "table:action", action, events);
    if (!first.ok) throw new Error(`Legal action failed: ${first.code}`);

    if (!duplicateChecked) {
      const duplicate = await emitAck(actor, "table:action", action, events);
      if (!isDeepStrictEqual(duplicate, first)) {
        metric(events, "counter", "poker.duplicate_commits", 1);
        throw new Error("Duplicate action changed the committed result");
      }
      duplicateChecked = true;
    }
    await recordServerEventLoopLag(target, events);
  }
}

async function reconnectFivePercent(
  target,
  tableNumber,
  player,
  cookie,
  events,
) {
  if (tableNumber % 10 !== 0) return player;
  metric(events, "counter", "poker.reconnect_attempts", 1);
  player.disconnect();
  const reconnected = await connect(target, cookie);
  metric(events, "counter", "poker.reconnect_success", 1);
  return reconnected;
}

async function runTable(context, events) {
  metric(events, "counter", "poker.duplicate_commits", 0);
  const target = context.vars.loadTarget;
  if (typeof target !== "string") {
    throw new Error("loadTarget must be configured");
  }
  const tableNumber = ++tableSequence;
  const randomSuffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const unique = `${process.pid}-${tableNumber}-${randomSuffix}`;
  const ownerSession = await requestJson(target, "/api/game/v1/guest-session", {
    nickname: `O_${tableNumber}_${randomSuffix}`,
  });
  const playerSession = await requestJson(
    target,
    "/api/game/v1/guest-session",
    {
      nickname: `P_${tableNumber}_${randomSuffix}`,
    },
  );
  const ownerCookie = sessionCookie(ownerSession.headers);
  const playerCookie = sessionCookie(playerSession.headers);
  const room = await requestJson(target, "/api/game/v1/rooms", {
    name: `Load ${unique}`,
    seats: 2,
    smallBlind: 5,
    bigBlind: 10,
    minBuyIn: 100,
    maxBuyIn: 1_000,
    actionTimeoutSeconds: 120,
  });

  let owner;
  let player;
  try {
    owner = await connect(target, ownerCookie);
    player = await connect(target, playerCookie);
    const ownerJoin = await emitAck(
      owner,
      "table:join",
      { roomId: room.body.id, seat: 0, buyIn: 500 },
      events,
    );
    const playerJoin = await emitAck(
      player,
      "table:join",
      { roomId: room.body.id, seat: 1, buyIn: 500 },
      events,
    );
    if (!ownerJoin.ok || !playerJoin.ok) throw new Error("Table join failed");
    owner = await reconnectFivePercent(
      target,
      tableNumber,
      owner,
      ownerCookie,
      events,
    );
    if (tableNumber % 10 === 0) {
      const reconnectJoin = await emitAck(
        owner,
        "table:join",
        { roomId: room.body.id, seat: 0, buyIn: 500, sinceVersion: 0 },
        events,
      );
      if (!reconnectJoin.ok) throw new Error("Reconnect join failed");
    }
    await playLegalActions(target, room.body.id, [owner, player], events);
  } finally {
    owner?.disconnect();
    player?.disconnect();
  }
}

function runTwoPlayerTable(context, events, done) {
  runTable(context, events)
    .then(() => done())
    .catch(done);
}

module.exports = { runTwoPlayerTable };
