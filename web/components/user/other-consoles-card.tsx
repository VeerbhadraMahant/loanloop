"use client";

import React from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export function OtherConsolesCard() {
  const { t } = useI18n();

  const consoles = [
    {
      group: "Staff Consoles (PC / Laptop)",
      badge: "Staff Only",
      links: [
        {
          label: t.help.staff_collections,
          desc: "Delinquency queues, PTP recording & borrower notes",
          href: "/collections",
          icon: (
            <svg className="w-4 h-4 text-warn-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          ),
        },
        {
          label: t.help.staff_ops,
          desc: "Real-time SSE call stream & human handovers",
          href: "/ops",
          icon: (
            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          ),
        },
      ],
    },
    {
      group: "Developer Consoles (PC / Laptop)",
      badge: "Dev",
      links: [
        {
          label: t.help.dev_lab,
          desc: "Voice pipeline inspection, STT & prompt debugging",
          href: "/dev",
          icon: (
            <svg className="w-4 h-4 text-accent-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          ),
        },
        {
          label: "Regression & Test Cases",
          desc: "Run TC-8801 through TC-8805 suites",
          href: "/test-cases",
          icon: (
            <svg className="w-4 h-4 text-ok-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          ),
        },
        {
          label: t.help.dev_metrics,
          desc: "E2E latency, task completion & secret detection",
          href: "/metrics",
          icon: (
            <svg className="w-4 h-4 text-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          ),
        },
      ],
    },
  ];

  return (
    <div className="bg-card rounded-2xl border border-line p-4 shadow-xs">
      <div className="mb-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
          {t.help.other_consoles_title}
        </h4>
        <p className="text-[11px] text-muted mt-0.5">
          {t.help.other_consoles_desc}
        </p>
      </div>

      <div className="space-y-4">
        {consoles.map((c, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted px-1">
              <span>{c.group}</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 bg-surface-container rounded text-muted">
                {c.badge}
              </span>
            </div>

            <div className="space-y-1">
              {c.links.map((link, j) => (
                <Link
                  key={j}
                  href={link.href}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-container text-fg border border-line/60 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-surface-container group-hover:bg-card transition-colors">
                      {link.icon}
                    </div>
                    <div>
                      <div className="text-xs font-semibold group-hover:text-primary transition-colors">
                        {link.label}
                      </div>
                      <div className="text-[10px] text-muted">{link.desc}</div>
                    </div>
                  </div>

                  <svg
                    className="w-4 h-4 text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
