"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UserShell } from "@/components/user/user-shell";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/user/session";
import { useHoldToTalk } from "@/lib/use-hold-to-talk";
import { sendVoiceTurn, startVoiceSession } from "@/lib/user/user-service";
import { BottomSheet } from "@/components/user/bottom-sheet";
import { ApprovalCard } from "@/components/user/approval-sheet";
import { fetchUserApprovals } from "@/lib/user/user-service";
import { Approval } from "@/lib/api";
import { ErrorBox } from "@/components/ui";
import { Button } from "@/components/ui/button";

interface Message {
  id: string;
  who: "user" | "agent";
  text: string;
  actions?: Array<{ name: string; ok: boolean }>;
  timestamp: string;
}

function TalkContent() {
  const { t } = useI18n();
  const { user, micMode, sessionFailed } = useSession();
  const searchParams = useSearchParams();

  const customerKey = user?.customerKey; // from the signed-in session; undefined until /auth/me answers
  const initialQuery = searchParams.get("q");

  const [callId, setCallId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [inputText, setInputText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tapTalking, setTapTalking] = useState(false);
  const [activeApproval, setActiveApproval] = useState<Approval | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const playAudioBase64 = useCallback((b64: string) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(`data:audio/wav;base64,${b64}`);
      audioRef.current = audio;
      setStatus("speaking");
      audio.onended = () => {
        setStatus("idle");
      };
      audio.onerror = () => {
        setStatus("idle");
      };
      audio.play().catch(() => setStatus("idle"));
    } catch {
      setStatus("idle");
    }
  }, []);

  // Initialize voice session on mount
  useEffect(() => {
    if (!customerKey) return;
    let active = true;
    startVoiceSession(customerKey)
      .then((session) => {
        if (!active) return;
        setCallId(session.call_id);
        if (session.greeting) {
          setMessages([
            {
              id: "greet",
              who: "agent",
              text: session.greeting,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
          ]);
          if (session.audio_b64) {
            playAudioBase64(session.audio_b64);
          }
        }
      })
      .catch((err) => {
        if (active) setErrorMsg(err instanceof Error ? err.message : "Could not start the voice session");
      });

    return () => {
      active = false;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [customerKey, playAudioBase64]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const handleTurnSubmit = useCallback(
    async ({ text, wav }: { text?: string; wav?: Blob }) => {
      if (!text && !wav) return;
      setErrorMsg(null);
      setStatus("thinking");
      setCurrentStep(2);

      const userMsgText = text ?? "Spoken audio turn";
      const userMsgId = `u_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          who: "user",
          text: userMsgText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);

      try {
        if (!callId) throw new Error("Voice session is not ready yet");
        const reply = await sendVoiceTurn({
          call_id: callId,
          user_text: text,
          wavBlob: wav,
        });

        if (reply.user_text && !text) {
          setMessages((prev) =>
            prev.map((m) => (m.id === userMsgId ? { ...m, text: reply.user_text! } : m))
          );
        }

        const agentMsgId = `a_${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: agentMsgId,
            who: "agent",
            text: reply.agent_text,
            actions: reply.actions,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);

        setCurrentStep(3);

        if (reply.actions?.some((a) => a.name.toLowerCase().includes("approval") || !a.ok)) {
          fetchUserApprovals().then((apprs) => {
            const pending = apprs.find((a) => a.status === "pending");
            if (pending) setActiveApproval(pending);
          }).catch(() => {}); // non-blocking: the turn itself already succeeded
        }

        if (reply.audio_b64) {
          playAudioBase64(reply.audio_b64);
        } else {
          setStatus("idle");
        }
      } catch (err) {
        setStatus("idle");
        setErrorMsg(err instanceof Error ? err.message : "Voice processing error");
      }
    },
    [callId, playAudioBase64]
  );

  const initialSentRef = useRef(false);
  useEffect(() => {
    if (initialQuery && callId && !initialSentRef.current) {
      initialSentRef.current = true;
      handleTurnSubmit({ text: initialQuery });
    }
  }, [initialQuery, callId, handleTurnSubmit]);

  const { talking: holdTalking, props: holdProps } = useHoldToTalk(
    micMode === "hold",
    (wav) => handleTurnSubmit({ wav }),
    (err) => setErrorMsg(err)
  );

  const isCurrentlyListening = micMode === "hold" ? holdTalking : tapTalking;
  useEffect(() => {
    if (isCurrentlyListening) {
      setStatus("listening");
      setCurrentStep(1);
    } else if (status === "listening") {
      setStatus("thinking");
    }
  }, [isCurrentlyListening, status]);

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const q = inputText.trim();
    setInputText("");
    setShowKeyboard(false);
    handleTurnSubmit({ text: q });
  };

  return (
    <UserShell activeTab="talk" title={t.talk.title}>
      <div className="flex flex-col h-[calc(100vh-140px)] sm:h-[750px] justify-between pb-2">
        {/* Top 3-Step Voice Stepper */}
        <div className="bg-card rounded-2xl p-3 border border-line shadow-xs mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                  currentStep >= 1
                    ? "bg-primary text-primary-fg"
                    : "bg-surface-container text-muted"
                }`}
              >
                1
              </span>
              <span className="text-xs font-semibold text-fg">{t.talk.step_speak}</span>
            </div>

            <div className="flex-1 h-0.5 mx-2 bg-line" />

            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                  currentStep >= 2
                    ? "bg-primary text-primary-fg"
                    : "bg-surface-container text-muted"
                }`}
              >
                2
              </span>
              <span className="text-xs font-semibold text-fg">{t.talk.step_check}</span>
            </div>

            <div className="flex-1 h-0.5 mx-2 bg-line" />

            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                  currentStep === 3
                    ? "bg-ok-fg text-white"
                    : "bg-surface-container text-muted"
                }`}
              >
                3
              </span>
              <span className="text-xs font-semibold text-fg">{t.talk.step_send}</span>
            </div>
          </div>
        </div>

        {/* Live Conversation Transcript */}
        <div className="flex-1 overflow-y-auto space-y-3 px-1 py-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.who === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3.5 shadow-xs text-xs leading-relaxed ${
                  msg.who === "user"
                    ? "bg-primary text-primary-fg rounded-tr-xs"
                    : "bg-card text-fg border border-line rounded-tl-xs"
                }`}
              >
                <p className="font-sans whitespace-pre-wrap">{msg.text}</p>

                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-line/60 flex flex-wrap gap-1">
                    {msg.actions.map((act, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${
                          act.ok
                            ? "bg-ok-bg text-ok-fg border border-ok-border"
                            : "bg-warn-bg text-warn-fg border border-warn-border"
                        }`}
                      >
                        <span>{act.name}</span>
                        <span>{act.ok ? "✓" : "!"}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[9px] font-mono text-muted mt-1 px-1">
                {msg.timestamp}
              </span>
            </div>
          ))}

          {status === "thinking" && (
            <div className="flex items-center gap-2 text-xs text-muted p-2 bg-card rounded-xl border border-line w-fit">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
              <span>Thinking...</span>
            </div>
          )}

          {status === "speaking" && (
            <div className="flex items-center gap-2 text-xs text-primary p-2 bg-accent-soft rounded-xl border border-primary/20 w-fit">
              <svg className="w-4 h-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              <span>Speaking response...</span>
            </div>
          )}

          {sessionFailed && (
            <div>
              <ErrorBox error="Could not load your session, so the call cannot start." />
              <Button type="button" onClick={() => window.location.reload()}>Retry</Button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-danger-bg text-danger-fg text-xs border border-danger-line">
              {errorMsg}
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Bottom Interaction Area */}
        <div className="pt-3 border-t border-line/80">
          {showKeyboard ? (
            <form onSubmit={handleSendText} className="flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={t.talk.type_placeholder}
                className="flex-1 py-3 px-4 text-xs rounded-xl border border-line bg-card text-fg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                autoFocus
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="p-3 rounded-xl bg-primary text-primary-fg hover:bg-accent-hover active:scale-95 transition-all disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setShowKeyboard(false)}
                className="p-3 rounded-xl bg-surface-container text-muted hover:text-fg"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <div className="flex items-center gap-1.5 h-6 mb-2">
                {[1, 2, 3, 4, 5].map((bar) => (
                  <span
                    key={bar}
                    className={`w-1 rounded-full transition-all duration-200 ${
                      isCurrentlyListening
                        ? "bg-primary animate-pulse h-5"
                        : "bg-outline-variant h-2"
                    }`}
                  />
                ))}
              </div>

              {micMode === "hold" ? (
                <button
                  type="button"
                  {...holdProps}
                  className={`w-18 h-18 rounded-full flex items-center justify-center shadow-lg border-4 transition-all duration-150 cursor-pointer ${
                    holdTalking
                      ? "bg-danger-fg text-white border-danger-line scale-95 ring-4 ring-danger-fg/30 animate-pulse"
                      : "bg-primary text-primary-fg border-card hover:scale-105 active:scale-95 shadow-primary/30"
                  }`}
                  aria-label={t.home.hold_to_talk}
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setTapTalking(!tapTalking)}
                  className={`w-18 h-18 rounded-full flex items-center justify-center shadow-lg border-4 transition-all duration-150 cursor-pointer ${
                    tapTalking
                      ? "bg-danger-fg text-white border-danger-line scale-95 ring-4 ring-danger-fg/30 animate-pulse"
                      : "bg-primary text-primary-fg border-card hover:scale-105 active:scale-95 shadow-primary/30"
                  }`}
                  aria-label={t.home.tap_to_talk}
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              )}

              <div className="flex items-center justify-between w-full mt-2 px-2">
                <span className="text-[11px] text-muted">
                  {isCurrentlyListening
                    ? t.home.listening
                    : micMode === "hold"
                    ? t.home.hold_to_talk
                    : t.home.tap_to_talk}
                </span>

                <button
                  type="button"
                  onClick={() => setShowKeyboard(true)}
                  className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {t.talk.keyboard_mode}
                </button>
              </div>
            </div>
          )}
        </div>

        <BottomSheet
          open={Boolean(activeApproval)}
          onClose={() => setActiveApproval(null)}
          title="In-App Approval Required"
          subtitle="Confirm your requested account modification"
        >
          {activeApproval && (
            <ApprovalCard
              approval={activeApproval}
              onResolved={() => setActiveApproval(null)}
            />
          )}
        </BottomSheet>
      </div>
    </UserShell>
  );
}

export default function TalkPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted">Starting voice session...</div>}>
      <TalkContent />
    </Suspense>
  );
}
