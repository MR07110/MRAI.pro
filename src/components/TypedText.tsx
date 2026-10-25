"use client";

import { useEffect, useRef, useState } from "react";

/** Types `text` out once, terminal style, with a block caret. Layout is reserved up front so nothing jumps. */
export default function TypedText({ text, startDelay = 300 }: { text: string; startDelay?: number }) {
  const nRef = useRef(0);
  const [, force] = useState(0);
  const [caret, setCaret] = useState(true);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      setCaret(true);
      hideTimer = setTimeout(() => alive && setCaret(false), 1600);
    };
    const step = () => {
      if (!alive) return;
      const full = textRef.current.length;
      if (document.hidden || reduce) {
        nRef.current = full;
        force((n) => n + 1);
        finish();
        return;
      }
      if (nRef.current < full) {
        nRef.current += 1;
        force((n) => n + 1);
        timer = setTimeout(step, 35 + Math.random() * 55);
      } else {
        finish();
      }
    };
    timer = setTimeout(step, nRef.current === 0 ? startDelay : 0);
    const onVis = () => {
      if (!document.hidden) {
        nRef.current = textRef.current.length;
        force((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      if (hideTimer) clearTimeout(hideTimer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [text, startDelay]);

  const shown = text.slice(0, nRef.current);
  return (
    <span className="relative inline-block text-left max-w-full">
      <span className="invisible" aria-hidden>{text}</span>
      <span className="absolute left-0 top-0 w-full" aria-label={text}>
        {shown}
        {caret && <span className="term-caret" aria-hidden />}
      </span>
    </span>
  );
}
