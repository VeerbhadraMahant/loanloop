"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useRef, useState, useEffect } from "react";

interface OtpPinInputProps {
  length?: number;
  value: string;
  onChange: (otp: string) => void;
  onComplete?: (otp: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}

export function OtpPinInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
}: OtpPinInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [digits, setDigits] = useState<string[]>(() => {
    const arr = value.split("").slice(0, length);
    while (arr.length < length) arr.push("");
    return arr;
  });

  useEffect(() => {
    const arr = value.split("").slice(0, length);
    while (arr.length < length) arr.push("");
    setDigits(arr);
  }, [value, length]);

  const handleChange = (index: number, char: string) => {
    if (disabled) return;
    const clean = char.replace(/\D/g, "");
    if (!clean) return;

    const next = [...digits];
    if (clean.length > 1) {
      const pastedChars = clean.slice(0, length - index);
      for (let i = 0; i < pastedChars.length; i++) {
        next[index + i] = pastedChars[i];
      }
      const combined = next.join("");
      onChange(combined);
      if (combined.length === length) onComplete?.(combined);
      const nextFocus = Math.min(length - 1, index + pastedChars.length);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    next[index] = clean[0];
    const combined = next.join("");
    onChange(combined);

    if (combined.length === length && next.every((d) => d !== "")) {
      onComplete?.(combined);
    } else if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        const next = [...digits];
        next[index - 1] = "";
        onChange(next.join(""));
        inputRefs.current[index - 1]?.focus();
      } else {
        const next = [...digits];
        next[index] = "";
        onChange(next.join(""));
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;

    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    const combined = next.join("");
    onChange(combined);
    if (pasted.length === length) {
      onComplete?.(combined);
      inputRefs.current[length - 1]?.focus();
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 select-none" onPaste={handlePaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className={`w-12 h-14 text-center font-mono text-xl font-bold rounded-xl border bg-card text-fg transition-all duration-150 focus:outline-none focus:ring-2 ${
            hasError
              ? "border-danger-fg text-danger-fg focus:ring-danger-fg/30 bg-danger-bg/20"
              : digit
              ? "border-primary bg-primary/5 text-primary focus:ring-primary/30"
              : "border-line focus:border-primary focus:ring-primary/20"
          }`}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
