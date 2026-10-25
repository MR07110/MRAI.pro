"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import * as serverDb from "@/lib/serverDb";
import type { UserApiKey } from "@/types";
import KeyEditor from "./KeyEditor";
import ModelField from "./ModelField";
import { maskKey, shortProviderName } from "@/lib/modelsCatalog";
import { useConfirm } from "./ConfirmProvider";

interface Props {
  compact?: boolean;
  /** called when a key is selected or saved (to close the quick dialog) */
  onSelected?: () => void;
}

type Mode = { type: "list" } | { type: "edit"; key: UserApiKey | null };

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mr_ai_keys_updated"));
}

// Key list + add/edit. Same look as the Connectors and Tasks panels: title + hint on the left, a white
// primary button on the right, flat bordered cards below. Also used in the dialog opened from the chat input.
export default function KeysManager({ compact = false, onSelected }: Props) {
  const confirm = useConfirm();
  const [keys, setKeys] = useState<UserApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>({ type: "list" });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setKeys((await serverDb.getKeys()) || []);
    } catch {
      setKeys([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function pick(k: UserApiKey) {
    if (busyId) return;
    if (!k.is_default) {
      setBusyId(k.id);
      await serverDb.setDefaultKey(k.id);
      notify();
      await load();
      setBusyId(null);
    }
    onSelected?.();
  }

  async function remove(k: UserApiKey) {
    if (!(await confirm({ title: "Delete this key?", confirmLabel: "Delete", danger: true }))) return;
    setBusyId(k.id);
    await serverDb.deleteKey(k.id);
    const rest = keys.filter((x) => x.id !== k.id);
    if (k.is_default && rest[0]) await serverDb.setDefaultKey(rest[0].id);
    notify();
    await load();
    setBusyId(null);
  }

  const editing = mode.type === "edit";

  const header = (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-neutral-100">API keys</h3>
        <p className="text-xs text-neutral-400">
          Paste a key and the provider is detected automatically. The active key is used for chat and the agent.
        </p>
      </div>
      {!editing && (
        <button
          type="button"
          onClick={() => setMode({ type: "edit", key: null })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New key
        </button>
      )}
    </div>
  );

  if (mode.type === "edit") {
    return (
      <div>
        {!compact && header}
        <div className="p-4 border border-white/15 bg-black/60">
          <KeyEditor
            key={mode.key?.id || "new"}
            existing={mode.key}
            compact={compact}
            onCancel={() => {
              setMode({ type: "list" });
              if (keys.length === 0) onSelected?.();
            }}
            onDone={async () => {
              await load();
              setMode({ type: "list" });
              onSelected?.();
            }}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        {!compact && header}
        <div className="text-center py-10 text-neutral-500 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      {!compact && header}

      {keys.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-white/15 bg-black/40">
          <KeyRound className="w-9 h-9 text-neutral-600 mx-auto mb-3" />
          <p className="text-sm text-neutral-300">No API keys yet</p>
          <p className="text-xs text-neutral-500 mt-1">Add a key from any provider and the AI will start working.</p>
          {compact && (
            <button
              type="button"
              onClick={() => setMode({ type: "edit", key: null })}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New key
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {keys.map((k) => (
            <div key={k.id} className={`p-3.5 border bg-black/60 transition ${k.is_default ? "border-white/35" : "border-white/15"}`}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => pick(k)}
                  title="Set as active provider"
                  className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                >
                  {busyId === k.id ? (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin text-neutral-300" />
                  ) : (
                    <KeyRound className={`w-4 h-4 shrink-0 ${k.is_default ? "text-white" : "text-neutral-600"}`} />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-neutral-100 truncate">
                      {shortProviderName(k.provider)}
                      {k.is_default && <span className="ml-2 text-[11px] font-normal text-emerald-400">active</span>}
                    </span>
                    <span className="block text-[11px] text-neutral-500 font-mono truncate">{maskKey(k.api_key)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode({ type: "edit", key: k })}
                  title="Edit key"
                  aria-label="Edit"
                  className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/[0.07] transition cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(k)}
                  title="Delete"
                  aria-label="Delete"
                  className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-white/[0.07] transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-white/15">
                <ModelField keyItem={k} onChanged={() => load()} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
