"use client";
/* eslint-disable react-hooks/refs -- the returned props are event handlers; refs are only read when they fire, not during render */
import { useCallback, useEffect, useRef, useState } from "react";
import { downsample, encodeWav } from "@/lib/wav";

const MIN_SECONDS = 0.3;
const MAX_SECONDS = 25;
type Rec = { stop: () => Float32Array; rate: number; timer: ReturnType<typeof setTimeout> };

/** Hold-to-talk recorder (same logic as the /call page). onWav gets a 16 kHz mono WAV when the button is released. */
export function useHoldToTalk(enabled: boolean, onWav: (wav: Blob) => void, onError: (msg: string) => void) {
  const [talking, setTalking] = useState(false);
  const rec = useRef<Rec | null>(null);
  const holding = useRef(false);
  const opening = useRef(false);
  const cb = useRef({ onWav, onError });
  useEffect(() => { cb.current = { onWav, onError }; });

  const end = useCallback(() => {
    holding.current = false;
    const r = rec.current; if (!r) return;
    rec.current = null; clearTimeout(r.timer); setTalking(false);
    const pcm = downsample(r.stop(), r.rate);
    if (pcm.length >= MIN_SECONDS * 16000) cb.current.onWav(new Blob([encodeWav(pcm)], { type: "audio/wav" }));
  }, []);

  const begin = async () => {
    if (!enabled || holding.current || opening.current || rec.current) return;
    holding.current = true; opening.current = true;
    const ctx = new AudioContext(); // created inside the gesture so Safari lets it run
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1); // shortcut: deprecated but simplest, same as /call
      const chunks: Float32Array[] = [];
      proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(proc); proc.connect(ctx.destination);
      const tracks = stream.getTracks();
      const stop = () => {
        proc.disconnect(); src.disconnect(); tracks.forEach((t) => t.stop()); ctx.close();
        const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
        let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
        return all;
      };
      opening.current = false;
      rec.current = { stop, rate: ctx.sampleRate, timer: setTimeout(end, MAX_SECONDS * 1000) };
      if (!holding.current) { end(); return; } // released while the mic was opening
      setTalking(true);
    } catch {
      opening.current = false; holding.current = false;
      stream?.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      cb.current.onError("Microphone unavailable. Allow mic access, or type instead.");
    }
  };

  useEffect(() => () => { const r = rec.current; if (r) { clearTimeout(r.timer); rec.current = null; r.stop(); } }, []);

  const key = (down: boolean) => (e: React.KeyboardEvent) => {
    if (e.code !== "Space" && e.code !== "Enter") return;
    e.preventDefault();
    if (down) { if (!e.repeat) begin(); } else end();
  };
  const props = {
    onMouseDown: begin, onMouseUp: end, onMouseLeave: () => { if (holding.current) end(); },
    onTouchStart: begin, onTouchEnd: end, onTouchCancel: end,
    onKeyDown: key(true), onKeyUp: key(false), onBlur: () => { if (holding.current) end(); },
  };
  return { talking, props };
}
