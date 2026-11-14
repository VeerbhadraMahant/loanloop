"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import GooeyNav from "@/components/reactbits/GooeyNav/GooeyNav";
import { Arrow, NAV, Wordmark } from "./shared";

const ITEMS = NAV.map(([href, label]) => ({ href, label }));
const IDS = ["home", ...NAV.map(([href]) => href.slice(1))]; // "home" maps to -1: nothing active over the hero
const indexOf = (id: string) => NAV.findIndex(([href]) => href === `#${id}`);
const GOOEY_STYLE = { "--gn-ink": "#292827", "--gn-muted": "rgb(41 40 39 / 80%)" } as React.CSSProperties;
const GOOEY_COLORS = ["#714cb6", "#d4c7ff", "#e8e0ff"];

export function TopNav() {
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // the section whose top most recently crossed the upper part of the viewport is the active one
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(indexOf(e.target.id));
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const id of IDS) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  const close = () => dialogRef.current?.close();

  return (
    <header className="ll-topnav">
      <a href="#main" className="ll-skip">Skip to content</a>
      <div className="ll-wrap ll-topnavRow">
        <a href="#home" className="ll-topnavBrand" aria-label="LoanLoop home"><Wordmark /></a>
        <div className={`ll-topnavCentre ${active < 0 ? "ll-navIdle" : ""}`}>
          <GooeyNav
            items={ITEMS}
            theme="light"
            size="md"
            frame={false}
            color="#714cb6"
            activeTextColor="#ffffff"
            colors={GOOEY_COLORS}
            activeIndex={active}
            onChange={setActive}
            particleCount={10}
            style={GOOEY_STYLE}
          />
        </div>
        <div className="ll-topnavRight">
          <Link href="/staff/login" className="ll-topnavStaff">Staff sign in</Link>
          <Link href="/login" className="ll-btn ll-btnSm ll-outline">Customer sign in</Link>
          <button
            ref={buttonRef}
            type="button"
            className="ll-menuBtn"
            aria-expanded={open}
            aria-controls="ll-menu"
            aria-label="Menu"
            onClick={() => { setOpen(true); dialogRef.current?.showModal(); }}
          >
            <svg aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
        </div>
      </div>
      <dialog
        id="ll-menu"
        ref={dialogRef}
        className="ll-menu"
        aria-label="Menu"
        onClose={() => { setOpen(false); buttonRef.current?.focus(); }}
        onClick={(e) => { if (e.target === dialogRef.current) close(); }}
      >
        <div className="ll-menuPanel">
          <div className="ll-menuHead">
            <Wordmark />
            <button type="button" className="ll-menuBtn" aria-label="Close menu" onClick={close}>
              <svg aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <nav aria-label="Sections" className="ll-menuList">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} onClick={close}>{label}</a>
            ))}
          </nav>
          <div className="ll-menuFoot">
            <Link href="/staff/login" className="ll-menuStaff">Staff sign in</Link>
            <Link href="/login" className="ll-btn ll-primary w-full">Customer sign in</Link>
          </div>
        </div>
      </dialog>
    </header>
  );
}

export function Announcement() {
  return (
    <div className="ll-announce">
      <p>
        Demo with synthetic data. Sahyadri Finance Bank is a fictional lender.{" "}
        <a href="#about" className="ll-announceLink">About the project <Arrow /></a>
      </p>
    </div>
  );
}
