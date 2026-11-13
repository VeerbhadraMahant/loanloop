"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { fetchUserApprovals } from "@/lib/user/user-service";

interface BottomNavProps {
  activeTab?: "home" | "inbox" | "talk" | "help";
}

export function BottomNav({ activeTab = "home" }: BottomNavProps) {
  const { t } = useI18n();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let active = true;
    fetchUserApprovals()
      .then((res) => {
        if (!active) return;
        const count = Array.isArray(res) ? res.filter((a) => a && a.status === "pending").length : 0;
        setPendingCount(count);
      })
      .catch(() => {
        if (active) setPendingCount(0);
      });
    return () => {
      active = false;
    };
  }, []);

  const navItems = [
    {
      id: "home",
      href: "/user/home",
      label: t.nav.home,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      id: "inbox",
      href: "/user/inbox",
      label: t.nav.inbox,
      badge: pendingCount > 0 ? pendingCount : null,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
    {
      id: "talk",
      href: "/user/talk",
      label: t.nav.talk,
      isCenterMic: true,
      icon: (
        <svg className="w-6 h-6 text-primary-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      ),
    },
    {
      id: "help",
      href: "/user/help",
      label: t.nav.help,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="absolute bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-lg border-t border-line px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between max-w-sm mx-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;

          if (item.isCenterMic) {
            return (
              <div key={item.id} className="relative -top-5 flex flex-col items-center">
                <Link
                  href={item.href}
                  className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/25 border-4 border-bg hover:scale-105 active:scale-95 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  aria-label={item.label}
                >
                  {item.icon}
                </Link>
                <span className="text-[10px] font-semibold text-primary mt-1">
                  {item.label}
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 rounded-xl transition-colors relative select-none ${
                isActive
                  ? "text-primary font-semibold"
                  : "text-muted hover:text-fg hover:bg-surface-container/50"
              }`}
            >
              <div className="relative">
                {item.icon}
                {item.badge !== null && item.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 px-1.5 py-0.2 min-w-4 text-[9px] font-bold font-mono bg-danger-fg text-white rounded-full flex items-center justify-center shadow-sm">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

