"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/user/session";

interface VoiceCardProps {
  onStartTalk?: (presetUtterance?: string) => void;
}

export function VoiceCard({ onStartTalk }: VoiceCardProps) {
  const { t } = useI18n();
  const { micMode } = useSession();
  const router = useRouter();
  const [isHolding, setIsHolding] = useState(false);

  const handleTrigger = () => {
    if (onStartTalk) {
      onStartTalk();
    } else {
      router.push("/user/talk");
    }
  };

  return (
    <div className="bg-[var(--fill-aubergine)] text-white rounded-xl p-5 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-ok-fg motion-safe:animate-pulse" />
          <span className="text-sm font-medium uppercase tracking-wider text-white/80">
            {t.home.voice_card_title}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/80">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          {micMode === "hold" ? "Hold-to-Talk" : "Tap-to-Talk"}
        </span>
      </div>

      <p className="text-base text-white/80 mb-5 leading-relaxed">
        {t.home.voice_card_sub}
      </p>

      {/* Center Waveform & Mic Action */}
      <div className="flex flex-col items-center justify-center py-2">
        {/* Dynamic 5-bar Waveform preview */}
        <div className="flex items-center gap-1.5 h-8 mb-4">
          <span className="w-1 bg-[var(--fill-lilac)] rounded-full h-2 transition-colors duration-300" />
          <span className="w-1 bg-[var(--fill-lilac)] rounded-full h-4 transition-colors duration-300" />
          <span className="w-1 bg-[var(--fill-lilac)] rounded-full h-6 transition-colors duration-300" />
          <span className="w-1 bg-[var(--fill-lilac)] rounded-full h-4 transition-colors duration-300" />
          <span className="w-1 bg-[var(--fill-lilac)] rounded-full h-2 transition-colors duration-300" />
        </div>

        {/* Primary Mic Trigger Button */}
        <button
          type="button"
          onClick={handleTrigger}
          onMouseDown={() => setIsHolding(true)}
          onMouseUp={() => setIsHolding(false)}
          onTouchStart={() => setIsHolding(true)}
          onTouchEnd={() => setIsHolding(false)}
          className={`w-20 h-20 rounded-full bg-[var(--fill-lilac)] text-[var(--fill-aubergine)] flex items-center justify-center transition-colors duration-200 ease-[var(--ease-out)] motion-safe:active:scale-95 cursor-pointer relative ${
            isHolding ? "scale-95 ring-4 ring-white/40" : "hover:bg-white"
          }`}
          aria-label={micMode === "hold" ? t.home.hold_to_talk : t.home.tap_to_talk}
        >
          {/* Subtle radiating wave */}
          <span className="absolute inset-0 rounded-full border border-white/40 motion-safe:animate-ping opacity-30 pointer-events-none" />

          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>

        {/* Instruction label */}
        <div className="text-center mt-3">
          <span className="text-base font-medium text-white block">
            {micMode === "hold" ? t.home.hold_to_talk : t.home.tap_to_talk}
          </span>
          <span className="text-sm text-white/65">
            {micMode === "hold" ? t.home.release_to_send : "Tap to open voice session"}
          </span>
        </div>
      </div>
    </div>
  );
}

