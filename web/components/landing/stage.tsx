"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

// Client-only, lazy: none of the WebGL code is loaded until the stage decides to mount it.
const GradientASCII = dynamic(() => import("@/components/reactbits/GradientASCII/GradientASCII"), { ssr: false });
const PatternWaves = dynamic(() => import("@/components/reactbits/PatternWaves/PatternWaves"), { ssr: false });
const Lightfall = dynamic(() => import("@/components/reactbits/Lightfall/Lightfall"), { ssr: false });

const SHOW_MS = 12000;
const FADE_MS = 1700;
const COUNT = 3;
const NIGHT = "#150c2b";

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
  if (id === 1) {
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
  return (
    <Lightfall
      colors={["#d4c7ff", "#714cb6", "#e8e0ff", "#f2b07c"]}
      backgroundColor="#714cb6"
      speed={0.25}
      streakCount={2}
      density={0.45}
      glow={0.5}
      backgroundGlow={0.08}
      headGlow={0.35}
      bloom={0.15}
      twinkle={0.2}
      mouseInteraction={false}
      holdToWarp={false}
      intro={false}
      paused={paused}
      dpr={dpr}
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
    if (!enabled || hidden) return;
    let clear: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => {
      setState((s) => ({ cur: (s.cur + 1) % COUNT, prev: s.cur }));
      clearTimeout(clear);
      clear = setTimeout(() => setState((s) => ({ ...s, prev: -1 })), FADE_MS);
    }, SHOW_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(clear);
    };
  }, [enabled, hidden]);

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
