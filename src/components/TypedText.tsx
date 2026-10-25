"use client";

import { useEffect, useState } from "react";

/**
 * Welcome text: all letters are in the DOM from the start (opacity 0),
 * then each letter fades to opacity 1 one by one — like typing.
 */
export default function TypedText({ text, startDelay = 200, letterDelay = 45 }: { text: string; startDelay?: number; letterDelay?: number }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const chars = Array.from(text);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setVisibleCount(chars.length);
      return;
    }

    const step = (i: number) => {
      if (!alive) return;
      if (i > chars.length) return;
      setVisibleCount(i);
      if (i < chars.length) {
        timer = setTimeout(() => step(i + 1), letterDelay);
      }
    };

    timer = setTimeout(() => step(1), startDelay);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [text, startDelay, letterDelay, chars.length]);

  return (
    <span className="inline-block" aria-label={text}>
      {chars.map((ch, i) => (
        <span
          key={i}
          className="inline-block transition-opacity duration-150"
          style={{ opacity: i < visibleCount ? 1 : 0 }}
        >
          {ch === " " ? "\u00A0" : ch}
        </span>
      ))}
    </span>
  );
}
