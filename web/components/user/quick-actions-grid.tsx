"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

interface QuickActionsGridProps {
  onSelectAction?: (presetQuery: string) => void;
}

export function QuickActionsGrid({ onSelectAction }: QuickActionsGridProps) {
  const { t } = useI18n();
  const router = useRouter();

  const actions = [
    {
      id: "emi_date",
      title: t.home.tool_emi_date,
      subtitle: "Move from 5th to 10th",
      query: "Mujhe EMI date 5th se 10th change karni hai",
      icon: (
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: "balance",
      title: t.home.tool_balance,
      subtitle: "EMI amount & due date",
      query: "Mera EMI kitna hai aur agla due date kab hai?",
      icon: (
        <svg className="w-5 h-5 text-ok-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: "statement",
      title: t.home.tool_statement,
      subtitle: "Instant SMS delivery",
      query: "Mera account statement bhejo",
      icon: (
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: "branch",
      title: t.home.tool_branch,
      subtitle: "Timings & IFSC code",
      query: "Kothrud branch timing kya hai aur IFSC code batao",
      icon: (
        <svg className="w-5 h-5 text-warn-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      id: "hardship",
      title: t.home.tool_hardship,
      subtitle: "Medical or job relief",
      query: "Mera hospital expense ki wajah se EMI restructure karna hai",
      icon: (
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      id: "officer",
      title: t.home.tool_officer,
      subtitle: "Connect with branch staff",
      query: "Human loan officer se baat karao",
      icon: (
        <svg className="w-5 h-5 text-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  const handleTileClick = (query: string) => {
    if (onSelectAction) {
      onSelectAction(query);
    } else {
      router.push(`/user/talk?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
          {t.home.tools_heading}
        </h3>
        <span className="text-[10px] text-muted font-medium">1-tap shortcuts</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {actions.map((act) => (
          <button
            key={act.id}
            type="button"
            onClick={() => handleTileClick(act.query)}
            className="p-3.5 rounded-2xl bg-card border border-line hover:border-primary/40 hover:bg-surface-container/40 transition-all duration-150 text-left flex flex-col justify-between min-h-[92px] active:scale-95 group shadow-xs"
          >
            <div className="p-2 rounded-xl bg-surface-container w-fit group-hover:bg-accent-soft transition-colors mb-2">
              {act.icon}
            </div>
            <div>
              <div className="text-xs font-bold text-fg group-hover:text-primary transition-colors line-clamp-1">
                {act.title}
              </div>
              <div className="text-[10px] text-muted line-clamp-1 mt-0.5 font-medium">
                {act.subtitle}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

