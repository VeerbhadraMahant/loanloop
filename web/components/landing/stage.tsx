"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

// Client-only, lazy: none of the WebGL code is loaded until the stage decides to mount it.
const GradientASCII = dynamic(() => import("@/components/reactbits/GradientASCII/GradientASCII"), { ssr: false });
const PatternWaves = dynamic(() => import("@/components/reactbits/PatternWaves/PatternWaves"), { ssr: false });

const FADE_MS = 1700;
const NIGHT = "#150c2b";
// Layer 0 (GradientASCII) behind the hero; layer 1 (PatternWaves) once the visitor scrolls past most of the first screen.
const SCROLL_SWITCH = 0.75;

function subscribeMedia(query: string, cb: () => void) {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => subscribeMedia(query, cb),
    () => window.matchMedia(query).matches,
    () => false,
  );
}
function useHidden() {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    () => document.hidden,
    () => false,
  );
}

let webglOk: boolean | undefined;
function hasWebGL2() {
  if (webglOk === undefined) {
    try {
      const gl = document.createElement("canvas").getContext("webgl2");
      webglOk = !!gl;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webglOk = false;
    }
  }
  return webglOk;
}
const useWebGL = () => useSyncExternalStore(() => () => {}, hasWebGL2, () => false);

/** A thrown WebGL error removes the animated layer; the static gradient underneath stays. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Layer({ id, paused, dpr }: { id: number; paused: boolean; dpr?: number }) {
  if (id === 0) {
    return (
      <GradientASCII
        colors={["#281647", "#714cb6", "#d4c7ff", "#f2b07c"]}
        shape="horizon"
        cellSize={20}
        density={0.55}
        glyphOpacity={0.45}
        gradientOpacity={0.55}
        glow={0.05}
        flicker={0.08}
        grain={0.04}
        speed={0.6}
        flow={0.35}
        mouseInteraction={false}
        clickEffect="none"
        intro={false}
        dpr={dpr}
      />
    );
  }
  return (
    <PatternWaves
      preset="silk"
      color="#d4c7ff"
      backgroundColor={NIGHT}
      opacity={0.5}
      fade="edges"
      speed={0.5}
      interactive={false}
      intro={false}
      paused={paused}
    />
  );
}

export function BackgroundStage() {
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const small = useMedia("(max-width: 799px)");
  const hidden = useHidden();
  const gl = useWebGL();
  const enabled = gl && !reduced;
  const [state, setState] = useState({ cur: 0, prev: -1 });

  useEffect(() => {
    if (!enabled) return;
    let clear: ReturnType<typeof setTimeout> | undefined;
    let cur = 0;
    let fading = false;
    const update = () => {
      // hysteresis: switch down at 75% of the first screen, back up only above 50%, so the threshold doesn't flicker
      const y = window.scrollY / window.innerHeight;
      const want = cur === 0 ? (y > SCROLL_SWITCH ? 1 : 0) : (y > SCROLL_SWITCH - 0.25 ? 1 : 0);
      if (want === cur) return; // no re-render while scrolling within one zone
      // reversing mid-fade would restart both keyframes and flash; switch straight back instead
      setState({ cur: want, prev: fading ? -1 : cur });
      cur = want;
      fading = true;
      clearTimeout(clear);
      clear = setTimeout(() => {
        fading = false;
        setState((s) => ({ ...s, prev: -1 }));
      }, FADE_MS);
    };
    update(); // a reload mid-page starts on the right layer
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      clearTimeout(clear);
    };
  }, [enabled]);

  const dpr = small ? 1 : undefined;
  return (
    <div className="ll-stage" aria-hidden="true">
      {enabled &&
        [state.prev, state.cur].map((id, i) =>
          id < 0 ? null : (
            <div key={id} className={`ll-stageLayer ${i === 0 ? "ll-stageOut" : "ll-stageIn"}`}>
              <Guard>
                <Layer id={id} paused={hidden || i === 0} dpr={dpr} />
              </Guard>
            </div>
          ),
        )}
    </div>
  );
}
