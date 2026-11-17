"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/user/session";
import { useHoldToTalk } from "@/lib/use-hold-to-talk";
import { sendVoiceTurn, startVoiceSession, voiceAudioUrl } from "@/lib/user/user-service";
import { isDeadCall, storeCallId, storedCallId } from "@/lib/user/voice-call";
import { PcmPlayer } from "@/lib/pcm-player";
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

// One in-flight call creation shared by StrictMode's double mount, so it opens a single call.
let starting: ReturnType<typeof startVoiceSession> | null = null;
function newCall(customerKey: string) {
  return (starting ??= startVoiceSession(customerKey)
    .then((s) => { storeCallId(s.call_id); return s; })
    .finally(() => { starting = null; }));
}

export function CallingDeskTab({ initialQuery, queryNonce = 0 }: { initialQuery?: string; queryNonce?: number }) {
  const { t } = useI18n();
  const { user, micMode, sessionFailed } = useSession();

  const customerKey = user?.customerKey; // from the signed-in session; undefined until /auth/me answers

  const [callId, setCallId] = useState<string | null>(null);
  const callIdRef = useRef<string | null>(null); // latest id for async turn code
  const busyRef = useRef(false); // a turn is in flight
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false); // server ended the call; the next turn opens a new one
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [inputText, setInputText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeApproval, setActiveApproval] = useState<Approval | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const pcmRef = useRef<PcmPlayer | null>(null);
  const playSeq = useRef(0);
  // Streamed replies (?stream=1) come as audio_url (raw PCM), not base64.
  const playStream = useCallback((url: string) => {
    audioRef.current?.pause();
    setStatus("speaking");
    const mine = ++playSeq.current; // a superseded reply must not flip status to idle under the new one
    (pcmRef.current ??= new PcmPlayer()).play(voiceAudioUrl(url)).then(() => { if (mine === playSeq.current) setStatus("idle"); });
  }, []);

  const playAudioBase64 = useCallback((b64: string) => {
    try {
      playSeq.current++;
      pcmRef.current?.stop();
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

  // Initialize voice session on mount: reuse the stored call (page changes remount this tab), else open one.
  useEffect(() => {
    if (!customerKey) return;
    let active = true;
    const stored = storedCallId();
    if (stored) {
      callIdRef.current = stored;
      setCallId(stored);
    } else {
      newCall(customerKey)
        .then((session) => {
          if (!active) return;
          callIdRef.current = session.call_id;
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
            if (session.audio_url) playStream(session.audio_url);
            else if (session.audio_b64) playAudioBase64(session.audio_b64);
          }
        })
        .catch((err) => {
          if (active) setErrorMsg(err instanceof Error ? err.message : "Could not start the voice session");
        });
    }

    return () => {
      active = false;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      pcmRef.current?.dispose();
      pcmRef.current = null;
    };
  }, [customerKey, playAudioBase64, playStream]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const handleTurnSubmit = useCallback(
    async ({ text, wav }: { text?: string; wav?: Blob }) => {
      if ((!text && !wav) || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setErrorMsg(null);
      // Cut the previous reply so audio never overlaps.
      playSeq.current++;
      pcmRef.current?.stop();
      audioRef.current?.pause();
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
        const send = (id: string) => sendVoiceTurn({ call_id: id, user_text: text, wavBlob: wav });
        const fresh = async () => {
          if (!customerKey) throw new Error("Voice session is not ready yet");
          const s = await newCall(customerKey);
          callIdRef.current = s.call_id;
          setCallId(s.call_id);
          setEnded(false);
          return s.call_id;
        };
        let reply;
        try {
          reply = await send(callIdRef.current ?? (await fresh()));
        } catch (err) {
          if (!isDeadCall(err)) throw err;
          // Ended (409) or expired/restarted (404): start a new call and replay this turn once.
          storeCallId(null);
          const id = await fresh();
          setMessages((prev) => [...prev, { id: `n_${Date.now()}`, who: "agent", text: "Started a new call", timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
          reply = await send(id);
        }
        if (reply.ended) {
          storeCallId(null);
          callIdRef.current = null;
          setEnded(true);
          setMessages((prev) => [...prev, { id: `e_${Date.now()}`, who: "agent", text: "Call ended. Your next message starts a new call.", timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
        }

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

        if (reply.audio_url) {
          playStream(reply.audio_url);
        } else if (reply.audio_b64) {
          playAudioBase64(reply.audio_b64);
        } else {
          setStatus("idle");
        }
      } catch (err) {
        setStatus("idle");
        setErrorMsg(err instanceof Error ? err.message : "Voice processing error");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [customerKey, playAudioBase64, playStream]
  );

  // Each quick-action tap bumps queryNonce; send it once the call exists and no turn is running.
  const sentNonceRef = useRef(0);
  useEffect(() => {
    if (initialQuery && queryNonce !== sentNonceRef.current && callId && !busy) {
      sentNonceRef.current = queryNonce;
      handleTurnSubmit({ text: initialQuery });
    }
  }, [initialQuery, queryNonce, callId, busy, handleTurnSubmit]);

  // One recorder for both modes: tap mode starts on the first tap and sends on the second.
  const { talking: holdTalking, props: holdProps } = useHoldToTalk(
    Boolean(callId || ended) && !busy,
    (wav) => handleTurnSubmit({ wav }),
    (err) => setErrorMsg(err)
  );

  const isCurrentlyListening = holdTalking;
  useEffect(() => {
    if (isCurrentlyListening) {
      setErrorMsg(null);
      setStatus("listening");
      setCurrentStep(1);
    } else {
      // "thinking" is set only when a turn is actually sent; a clip too short to send goes back to idle.
      setStatus((s) => (s === "listening" ? "idle" : s));
    }
  }, [isCurrentlyListening]);

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || busy) return;
    const q = inputText.trim();
    setInputText("");
    setShowKeyboard(false);
    handleTurnSubmit({ text: q });
  };

  return (
          <div className="flex flex-col h-full justify-between pb-2">
        {/* Top 3-Step Voice Stepper */}
        <div className="bg-surface-container rounded-xl p-3 ring-1 ring-fg/[0.04] mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full text-sm font-medium flex items-center justify-center transition-colors ${
                  currentStep >= 1
                    ? "bg-primary text-primary-fg"
                    : "bg-surface-container text-muted"
                }`}
              >
                1
              </span>
              <span className="text-sm font-medium text-fg">{t.talk.step_speak}</span>
            </div>

            <div className="flex-1 h-0.5 mx-2 bg-line" />

            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full text-sm font-medium flex items-center justify-center transition-colors ${
                  currentStep >= 2
                    ? "bg-primary text-primary-fg"
                    : "bg-surface-container text-muted"
                }`}
              >
                2
              </span>
              <span className="text-sm font-medium text-fg">{t.talk.step_check}</span>
            </div>

            <div className="flex-1 h-0.5 mx-2 bg-line" />

            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full text-sm font-medium flex items-center justify-center transition-colors ${
                  currentStep === 3
                    ? "bg-ok-fg text-white"
                    : "bg-surface-container text-muted"
                }`}
              >
                3
              </span>
              <span className="text-sm font-medium text-fg">{t.talk.step_send}</span>
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
                className={`max-w-[85%] rounded-xl p-3.5 text-sm leading-relaxed ${
                  msg.who === "user"
                    ? "bg-primary text-primary-fg rounded-tr-xs"
                    : "bg-surface-container text-fg ring-1 ring-fg/[0.04] rounded-tl-xs"
                }`}
              >
                <p className="font-sans whitespace-pre-wrap">{msg.text}</p>

                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-line/60 flex flex-wrap gap-1">
                    {msg.actions.map((act, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded-full ${
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
            <div className="flex items-center gap-2 text-sm text-muted p-2 bg-surface-container rounded-xl ring-1 ring-fg/[0.04] w-fit">
              <span className="w-2 h-2 rounded-full bg-primary motion-safe:animate-ping" />
              <span>Thinking...</span>
            </div>
          )}

          {status === "speaking" && (
            <div className="flex items-center gap-2 text-sm text-primary p-2 bg-accent-soft rounded-xl border border-primary/20 w-fit">
              <svg className="w-4 h-4 motion-safe:animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
            <div className="p-3 rounded-xl bg-danger-bg text-danger-fg text-sm border border-danger-line">
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
                className="flex-1 py-3 px-4 text-sm rounded-xl border border-line bg-card text-fg focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
                autoFocus
              />
              <button
                type="submit"
                disabled={!inputText.trim() || busy}
                className="p-3 rounded-xl bg-primary text-primary-fg hover:bg-accent-hover motion-safe:active:scale-95 transition-colors disabled:opacity-50"
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
                    className={`w-1 rounded-full transition-colors duration-200 ${
                      isCurrentlyListening
                        ? "bg-primary motion-safe:animate-pulse h-5"
                        : "bg-outline-variant h-2"
                    }`}
                  />
                ))}
              </div>

              {micMode === "hold" ? (
                <button
                  type="button"
                  {...holdProps}
                  className={`w-18 h-18 rounded-full flex items-center justify-center border-4 transition-colors duration-150 cursor-pointer ${
                    holdTalking
                      ? "bg-danger-fg text-white border-danger-line scale-95 ring-4 ring-danger-fg/30 motion-safe:animate-pulse"
                      : "bg-primary text-primary-fg border-card motion-safe:active:scale-95"
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
                  onClick={() => (holdTalking ? holdProps.onMouseUp() : holdProps.onMouseDown())}
                  className={`w-18 h-18 rounded-full flex items-center justify-center border-4 transition-colors duration-150 cursor-pointer ${
                    holdTalking
                      ? "bg-danger-fg text-white border-danger-line scale-95 ring-4 ring-danger-fg/30 motion-safe:animate-pulse"
                      : "bg-primary text-primary-fg border-card motion-safe:active:scale-95"
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
                  className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
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
  );
}
