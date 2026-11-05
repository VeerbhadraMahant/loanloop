// Run: node --experimental-strip-types lib/wav.check.mjs  (self-check for wav.ts)
import assert from "node:assert/strict";
import { downsample, encodeWav } from "./wav.ts";

const rate = 48000;
const sine = Float32Array.from({ length: rate }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / rate));
const ds = downsample(sine, rate);
assert.equal(ds.length, 16000);
const wav = encodeWav(ds);
const v = new DataView(wav.buffer);
const tag = (o) => String.fromCharCode(...wav.slice(o, o + 4));
assert.equal(wav.length, 44 + 16000 * 2);
assert.equal(tag(0), "RIFF"); assert.equal(tag(8), "WAVE"); assert.equal(tag(36), "data");
assert.equal(v.getUint32(4, true), wav.length - 8);
assert.equal(v.getUint16(20, true), 1); // PCM
assert.equal(v.getUint16(22, true), 1); // mono
assert.equal(v.getUint32(24, true), 16000);
assert.equal(v.getUint16(34, true), 16);
assert.equal(v.getUint32(40, true), 32000);
const peak = Math.max(...Array.from({ length: 16000 }, (_, i) => Math.abs(v.getInt16(44 + i * 2, true))));
assert.ok(peak > 30000 && peak <= 32767, `peak ${peak}`);
// out-of-range samples clamp instead of wrapping
assert.equal(new DataView(encodeWav(Float32Array.of(2, -2)).buffer).getInt16(44, true), 32767);
console.log("wav self-check OK");
