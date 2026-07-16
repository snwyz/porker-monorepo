import assert from "node:assert/strict";

const runtime = await import("../dist/apps/game-server/src/main.js");

assert.equal(typeof runtime.createApp, "function");
