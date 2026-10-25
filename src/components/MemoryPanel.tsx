"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Row, SectionHead, Switch, ui } from "./ui";

interface MemoryItem {
  id: string;
  text: string;
  ts: number;
}

function ago(ts: number): string {
  const d = Math.max(0, Date.now() / 1000 - ts);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function MemoryPanel() {
  const [enabled, setEnabled] = useState(true);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(""); // brief inline feedback: a failure, or "already saved"
  const noteTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!note) return;
    if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current);
    noteTimerRef.current = window.setTimeout(() => setNote(""), 4000);
    return () => {
      if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current);
    };
  }, [note]);

  const apply = (m: { enabled?: boolean; items?: MemoryItem[] }) => {
    if (typeof m.enabled === "boolean") setEnabled(m.enabled);
    if (Array.isArray(m.items)) setItems(m.items);
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/memory", { cache: "no-store" });
        const j = await r.json();
        if (r.ok) apply(j);
        else setNote(j?.error || "Could not load memory.");
      } catch {
        setNote("Could not reach the server.");
      }
      setLoading(false);
    })();
  }, []);

  async function post(body: Record<string, unknown>): Promise<{ ok: boolean; added?: boolean }> {
    setBusy(true);
    setNote("");
    try {
      const r = await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) {
        setNote(j?.error || "Something went wrong.");
        return { ok: false };
      }
      apply(j);
      return { ok: true, added: j?.added };
    } catch {
      setNote("Could not reach the server.");
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }

  const toggle = async (v: boolean) => {
    setEnabled(v); // optimistic
    const r = await post({ op: "toggle", enabled: v });
    if (!r.ok) setEnabled(!v); // revert on failure
  };
  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    const r = await post({ op: "add", text: t });
    // Only clear the input once it's actually confirmed saved — a failure or a duplicate leaves your
    // text in place, with a reason shown, instead of it just silently vanishing.
    if (r.ok && r.added) setDraft("");
    else if (r.ok && !r.added) setNote("Already saved — that fact is already in memory.");
  };

  return (
    <div>
      <SectionHead
        title="Memory"
        hint="The assistant saves durable facts (your name, preferences, recurring context) on its own and reuses them in later chats — like Claude. Turn it off and it neither reads nor writes memory."
      />

      <div className={`${ui.card} px-4`}>
        <Row title="Memory" hint={enabled ? "On — the assistant remembers and uses what it learns." : "Off — nothing is read or written."}>
          <Switch on={enabled} onChange={toggle} label="Memory" />
        </Row>
      </div>

      <div className={`mt-5 transition-opacity ${enabled ? "" : "opacity-40 pointer-events-none"}`}>
        <div className="flex items-center gap-2 mb-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add a memory manually…"
            className={`${ui.input} flex-1`}
          />
          <button
            onClick={add}
            disabled={!draft.trim() || busy}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 border border-white/20 text-[13px] text-neutral-200 hover:bg-white hover:text-black transition disabled:opacity-30 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>

        {note && <p className="mb-3 text-[12px] text-amber-400">{note}</p>}

        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono uppercase tracking-wide text-neutral-500">
            {items.length} {items.length === 1 ? "memory" : "memories"}
          </span>
          {items.length > 0 && (
            <button onClick={() => post({ op: "clear" })} disabled={busy} className="text-[12px] text-neutral-500 hover:text-red-400 transition cursor-pointer">
              Clear all
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-neutral-500 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="text-[13px] text-neutral-600 py-8 text-center border border-dashed border-white/10">
            No memories yet. The assistant will add them as it learns about you.
          </div>
        ) : (
          <div className="border border-white/15 divide-y divide-white/10">
            {[...items].reverse().map((m) => (
              <div key={m.id} className="group flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] text-neutral-200 break-words">{m.text}</div>
                  <div className="text-[11px] text-neutral-600 mt-0.5">{ago(m.ts)}</div>
                </div>
                <button
                  onClick={() => post({ op: "delete", id: m.id })}
                  disabled={busy}
                  title="Delete"
                  className="shrink-0 w-7 h-7 inline-flex items-center justify-center text-neutral-600 hover:text-red-400 hover:bg-white/[0.06] transition cursor-pointer opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
