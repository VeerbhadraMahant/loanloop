// Run: node --experimental-strip-types lib/user/voice-call.check.mjs  (self-check for voice-call.ts)
import assert from "node:assert/strict";
import { VoiceError, isDeadCall, storedCallId, storeCallId } from "./voice-call.ts";

assert.ok(isDeadCall(new VoiceError("x", 409)));
assert.ok(isDeadCall(new VoiceError("x", 404)));
assert.ok(!isDeadCall(new VoiceError("x", 500)));
assert.ok(!isDeadCall(new Error("x")));
assert.equal(storedCallId(), null); // no sessionStorage in node: degrades to null, never throws
storeCallId("a");
console.log("voice-call ok");
