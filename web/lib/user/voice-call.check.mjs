// Run: node --experimental-strip-types lib/user/voice-call.check.mjs  (self-check for voice-call.ts)
import assert from "node:assert/strict";
import { VoiceError, isDeadCall, storedCallId, storeCallId, loadTurns, storeTurns } from "./voice-call.ts";

assert.ok(isDeadCall(new VoiceError("x", 409)));
assert.ok(isDeadCall(new VoiceError("x", 404)));
assert.ok(isDeadCall(new VoiceError("x", 403)));
assert.ok(!isDeadCall(new VoiceError("x", 500)));
assert.ok(!isDeadCall(new Error("x")));
assert.equal(storedCallId(), null); // no sessionStorage in node: degrades to null, never throws
storeCallId("a");
assert.deepEqual(loadTurns("a"), []); // no storage: empty, never throws
storeTurns("a", [1]);
const mem = new Map();
globalThis.sessionStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
storeTurns("b", Array.from({ length: 80 }, (_, i) => i));
const t = loadTurns("b");
assert.equal(t.length, 50);
assert.equal(t[49], 79); // keeps the latest
storeTurns("b", null);
assert.deepEqual(loadTurns("b"), []);
mem.set("ll_turns_c", "{bad");
assert.deepEqual(loadTurns("c"), []);
console.log("voice-call ok");
