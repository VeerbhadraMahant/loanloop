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
    const ctx = (this.ctx ??= new AudioContext());
    try {
      await ctx.resume();
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok || !res.body) return false;
      const rate = Number(res.headers.get("X-Sample-Rate")) || fallbackRate;
      const reader = res.body.getReader();
      let carry = new Uint8Array(0), next = 0, last: AudioBufferSourceNode | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const buf = new Uint8Array(carry.length + value.length);
        buf.set(carry); buf.set(value, carry.length);
        const even = buf.length - (buf.length % 2); // a chunk may end mid-sample
        carry = buf.slice(even);
        if (!even) continue;
        const dv = new DataView(buf.buffer, 0, even);
        const f = new Float32Array(even / 2);
        for (let i = 0; i < f.length; i++) f[i] = dv.getInt16(i * 2, true) / 32768;
        const ab = ctx.createBuffer(1, f.length, rate);
        ab.copyToChannel(f, 0);
        const s = ctx.createBufferSource();
        s.buffer = ab; s.connect(ctx.destination);
        const at = Math.max(next, ctx.currentTime + 0.03); // small lead so the first chunk is not clipped
        s.start(at); next = at + ab.duration;
        this.srcs.add(s); s.onended = () => this.srcs.delete(s);
        last = s;
      }
      if (!last) return false;
      const l = last;
      await new Promise<void>((r) => { this.done = r; l.addEventListener("ended", () => r()); });
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
}
