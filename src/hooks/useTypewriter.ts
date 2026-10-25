"use client";

import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Types a streaming assistant message out character by character (like someone typing in a terminal).
 * - Speed adapts to the backlog: calm ~70 chars/s when only a little is waiting, faster when far behind.
 * - A message that is already there (history, page reload, re-attached run) is shown at once, never replayed.
 * - If the tab was in the background, everything that arrived meanwhile is shown instantly on return.
 */
export function useTypewriter(text: string, live: boolean) {
  const fresh = live && text.length <= 80 && !reduced();
  const shownRef = useRef(fresh ? 0 : text.length);
  const [active, setActive] = useState(fresh);
  const [, force] = useState(0);
  const textRef = useRef(text);
  textRef.current = text;
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    if (live && !reduced()) setActive(true);
  }, [live]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    let lastPaint = 0;
    let acc = 0;
    const snap = () => {
      shownRef.current = textRef.current.length;
      force((n) => n + 1);
    };
    const onVis = () => {
      if (!document.hidden) {
        snap();
        last = performance.now();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      const dt = Math.min(now - last, 100);
      last = now;
      const len = textRef.current.length;
      if (shownRef.current > len) shownRef.current = len;
      const backlog = len - shownRef.current;
      if (backlog > 0) {
        acc += ((70 + backlog * 6) * dt) / 1000;
        if (now - lastPaint >= 32) {
          const n = Math.floor(acc);
          if (n > 0) {
            acc -= n;
            shownRef.current = Math.min(len, shownRef.current + n);
            lastPaint = now;
            force((x) => x + 1);
          }
        }
      } else {
        acc = 0;
        if (!liveRef.current) {
          cancelAnimationFrame(raf);
          setActive(false);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active]);

  const out = active ? text.slice(0, shownRef.current) : text;
  return { text: out, typing: active };
}
