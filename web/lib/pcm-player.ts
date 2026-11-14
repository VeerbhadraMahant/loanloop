const MIN_BYTES = 3200; // 100 ms at 16 kHz mono 16-bit
const fade = (f: Float32Array, rate: number) => {
  const n = Math.min(f.length, Math.round(rate * 0.004));
  for (let i = 0; i < n; i++) { f[i] *= i / n; }
};

// Plays a streamed 16-bit mono little-endian PCM response (voice service audio_url) gapless via Web Audio.
export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private ac: AbortController | null = null;
  private srcs = new Set<AudioBufferSourceNode>();
  private done: (() => void) | null = null;

  /** Resolves true when playback finished, false when stopped or failed (the text is already on screen). */
  async play(url: string, fallbackRate = 16000): Promise<boolean> {
    this.stop();
    const ac = (this.ac = new AbortController());
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok || !res.body) return false;
      const rate = Number(res.headers.get("X-Sample-Rate")) || fallbackRate;
      // Run the context at the stream's rate: buffers at another rate are resampled one by one, which clicks at every chunk edge.
      if (this.ctx && this.ctx.sampleRate !== rate) { this.ctx.close().catch(() => {}); this.ctx = null; }
      const ctx = (this.ctx ??= new AudioContext({ sampleRate: rate }));
      await ctx.resume();
      const reader = res.body.getReader();
      let carry = new Uint8Array(0), next = 0, last = null as AudioBufferSourceNode | null;
      const emit = (even: number, buf: Uint8Array) => {
        const dv = new DataView(buf.buffer, buf.byteOffset, even);
        const f = new Float32Array(even / 2);
        for (let i = 0; i < f.length; i++) f[i] = dv.getInt16(i * 2, true) / 32768;
        const at = Math.max(next, ctx.currentTime + 0.06); // lead so the first chunk is not clipped
        if (at > next) fade(f, rate); // we ran dry: a hard edge after silence is an audible tick
        const ab = ctx.createBuffer(1, f.length, rate);
        ab.copyToChannel(f, 0);
        const s = ctx.createBufferSource();
        s.buffer = ab; s.connect(ctx.destination);
        s.start(at); next = at + ab.duration;
        this.srcs.add(s); s.onended = () => this.srcs.delete(s);
        last = s;
      };
      for (;;) {
        const { done, value } = await reader.read();
        const buf = new Uint8Array(carry.length + (value?.length ?? 0));
        buf.set(carry); if (value) buf.set(value, carry.length);
        const even = buf.length - (buf.length % 2); // a chunk may end mid-sample
        if (done) { if (even) emit(even, buf); break; }
        if (even < MIN_BYTES) { carry = buf; continue; } // coalesce tiny network chunks into fewer, longer buffers
        carry = buf.slice(even);
        emit(even, buf);
      }
      if (!last) return false;
      const l: AudioBufferSourceNode = last;
      // the last source may already have ended before the listener attaches: also resolve on the clock and a safety timeout
      await new Promise<void>((r) => {
        const fin = () => { clearTimeout(tm); r(); };
        const tm = setTimeout(fin, Math.max(0, next - ctx.currentTime) * 1000 + 1000);
        this.done = fin;
        l.addEventListener("ended", fin);
        if (ctx.currentTime >= next) fin();
      });
      return !ac.signal.aborted;
    } catch {
      return false;
    } finally {
      if (this.ac === ac) this.ac = null;
    }
  }

  stop() {
    this.ac?.abort();
    this.ac = null;
    for (const s of this.srcs) { s.onended = null; try { s.stop(); } catch { /* not started */ } }
    this.srcs.clear();
    this.done?.(); this.done = null;
  }

  /** Stop and release the AudioContext (call on unmount; browsers cap concurrent contexts). */
  dispose() {
    this.stop();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
