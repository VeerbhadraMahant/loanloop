"use client";

import { get, post, Approval, Sms } from "@/lib/api";

const VOICE_BASE = "/vx"; // same proxy /call uses: it forwards the ll_cust session cookie

export interface VoiceTurnResponse {
  user_text?: string;
  agent_text: string;
  audio_b64?: string;
  audio_url?: string;
  mime?: string;
  language?: string;
  actions?: Array<{ name: string; ok: boolean }>;
  ended?: boolean;
}

export async function fetchUserSms(): Promise<Sms[]> {
  try {
    return await get<Sms[]>("/phone/me/sms");
  } catch (err) {
    console.warn("fetchUserSms error:", err);
    return [];
  }
}

export async function fetchUserApprovals(): Promise<Approval[]> {
  try {
    return await get<Approval[]>("/phone/me/approvals");
  } catch (err) {
    console.warn("fetchUserApprovals error:", err);
    return [];
  }
}

export async function respondToApproval(
  approvalId: string | number,
  decision: "approve" | "deny"
): Promise<{ success: boolean; error?: string }> {
  try {
    await post(`/phone/me/approvals/${encodeURIComponent(String(approvalId))}/${decision}`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record approval decision",
    };
  }
}

export async function startVoiceSession(
  customerKey: string
): Promise<{ call_id: string; greeting: string; audio_b64?: string }> {
  const res = await fetch(`${VOICE_BASE}/calls?stream=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer: customerKey,
      tts: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to start voice call: HTTP ${res.status}`);
  }
  const data = await res.json();
  return {
    call_id: data.call_id,
    greeting: data.agent_text,
    audio_b64: data.audio_b64,
  };
}

export async function sendVoiceTurn(params: {
  call_id: string;
  user_text?: string;
  wavBlob?: Blob;
}): Promise<VoiceTurnResponse> {
  const isAudio = Boolean(params.wavBlob);
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": isAudio ? "audio/wav" : "application/json" },
    body: isAudio
      ? params.wavBlob
      : JSON.stringify({ text: params.user_text, tts: true }),
  };

  const res = await fetch(`${VOICE_BASE}/calls/${encodeURIComponent(params.call_id)}/turn?stream=1`, init);

  if (!res.ok) {
    throw new Error(`Voice turn failed: HTTP ${res.status}`);
  }
  return res.json();
}
