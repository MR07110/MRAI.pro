"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// Server limit sabab kutganda oqimga `[[wait:<tugash vaqti ms>]]` belgisini yuboradi.
const WAIT_RE = /\[\[wait:(\d{10,})\]\]/g;

export type Segment = { type: "md"; text: string } | { type: "wait"; end: number };

export function splitWait(content: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of content.matchAll(WAIT_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ type: "md", text: content.slice(last, i) });
    out.push({ type: "wait", end: Number(m[1]) });
    last = i + m[0].length;
  }
  if (last < content.length) out.push({ type: "md", text: content.slice(last) });
  return out;
}

export function stripWait(content: string): string {
  return content.replace(WAIT_RE, "").replace(/\n{3,}/g, "\n\n");
}

// Jonli sanagich: tugagach o'zi yo'qoladi (eski xabarlarda ham ko'rinmaydi).
export default function WaitCountdown({ end }: { end: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Date.now() >= end) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= end) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [end]);

  const left = Math.ceil((end - now) / 1000);
  if (left <= 0) return null;

  return (
    <div className="my-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-900/50 bg-amber-950/30 text-amber-300 text-xs">
      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
      <span>
        Provayder limiti: <span className="tabular-nums font-semibold">{left}</span> soniya kutilyapti…
      </span>
    </div>
  );
}
