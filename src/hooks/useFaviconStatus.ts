"use client";

import { useEffect, useRef } from "react";
import { setFavicon } from "@/lib/favicon";

const BLINK_MS = 600;

// Away from the tab? Combine visibility + window focus: either signal going "away" counts.
function isAway(): boolean {
  return typeof document !== "undefined" && (document.hidden || !document.hasFocus());
}

/**
 * Drives the browser-tab favicon from whether the assistant is currently generating a reply.
 * While away from the tab: blinks amber (thinking) during generation, then turns a steady green dot
 * once the reply is ready. The moment the tab regains focus, the favicon drops back to the plain
 * default immediately — whatever state the reply is in — so it is never distracting while watching it.
 */
export function useFaviconStatus(isStreaming: boolean) {
  const intervalRef = useRef<number | null>(null);
  const blinkOnRef = useRef(false);
  const streamingRef = useRef(isStreaming);
  const prevStreamingRef = useRef(isStreaming);

  const clearBlink = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const toDefault = () => {
    clearBlink();
    setFavicon("default");
  };

  const startBlink = () => {
    clearBlink();
    blinkOnRef.current = true;
    setFavicon("think1");
    intervalRef.current = window.setInterval(() => {
      blinkOnRef.current = !blinkOnRef.current;
      setFavicon(blinkOnRef.current ? "think1" : "think2");
    }, BLINK_MS);
  };

  const toSuccess = () => {
    clearBlink();
    setFavicon("success");
  };

  // Tab focus/visibility: regaining focus always wins and resets to default; losing focus while a
  // reply is still generating starts the blink (it wasn't running while the tab was focused).
  useEffect(() => {
    const onChange = () => {
      if (!isAway()) toDefault();
      else if (streamingRef.current) startBlink();
    };
    document.addEventListener("visibilitychange", onChange);
    window.addEventListener("focus", onChange);
    window.addEventListener("blur", onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
      window.removeEventListener("focus", onChange);
      window.removeEventListener("blur", onChange);
      clearBlink();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to the reply starting/finishing.
  useEffect(() => {
    streamingRef.current = isStreaming;
    const started = isStreaming && !prevStreamingRef.current;
    const finished = !isStreaming && prevStreamingRef.current;
    if (started) {
      if (isAway()) startBlink();
    } else if (finished) {
      if (isAway()) toSuccess();
      else toDefault();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);
}
