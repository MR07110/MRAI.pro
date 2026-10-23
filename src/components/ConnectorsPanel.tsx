"use client";

import { useEffect, useState } from "react";
import { Plug, Plus, Trash2, Loader2, Check, X, RefreshCw } from "lucide-react";
import * as serverDb from "@/lib/serverDb";
import type { Connector } from "@/types";

type TestState = { loading?: boolean; ok?: boolean; error?: string; tools?: { name: string; description: string }[]; ms?: number };

function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-9 h-5 rounded-full transition cursor-pointer p-0.5 shrink-0 ${on ? "bg-white" : "bg-neutral-800"}`}
    >
      <div className={`w-4 h-4 rounded-full bg-neutral-950 transition transform ${on ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

export default function ConnectorsPanel() {
  const [items, setItems] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tests, setTests] = useState<Record<string, TestState>>({});

  async function load() {
    setItems(await serverDb.getConnectors());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function runTest(id: string, c: { url: string; headers?: Record<string, string>; name?: string }) {
    setTests((t) => ({ ...t, [id]: { loading: true } }));
    const r = await serverDb.testConnector(c);
    setTests((t) => ({ ...t, [id]: { ...r, loading: false } }));
  }

  async function add() {
    setFormError("");
    if (!url.trim() || !/^https?:\/\//i.test(url.trim())) {
      setFormError("URL http:// yoki https:// bilan boshlanishi kerak");
      return;
    }
    const headers: Record<string, string> = {};
    setSaving(true);
    try {
      let nm = name.trim();
      if (!nm) {
        try {
          nm = new URL(url.trim()).hostname.replace(/^www\./, "");
        } catch {
          nm = "Connector";
        }
      }
      const id = await serverDb.saveConnector({ name: nm, url: url.trim(), headers, enabled: true });
      setName(""); setUrl(""); setShowForm(false);
      await load();
      runTest(id, { url: url.trim(), headers, name: nm });
    } catch (e: any) {
      setFormError(e?.message || "Saqlab bo‘lmadi (server ulanganmi?)");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: Connector) {
    setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, enabled: !x.enabled } : x)));
    try {
      await serverDb.saveConnector({ ...c, enabled: !c.enabled });
    } catch {
      load();
    }
  }

  async function remove(c: Connector) {
    if (!confirm(`"${c.name}" connectorini o‘chirasizmi?`)) return;
    await serverDb.deleteConnector(c.id).catch(() => {});
    load();
  }

  const inputCls =
    "w-full px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-100 text-xs placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">Connectorlar (MCP)</h3>
          <p className="text-xs text-neutral-400">Ulangan connector asboblarini AI avtomatik ishlata oladi. Soni cheklanmagan.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-200 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Ulash
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4 p-4 rounded-xl border border-neutral-800 bg-neutral-950/60 space-y-3">
          <div>
            <label className="block text-[11px] text-neutral-400 mb-1">MCP server URL</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] text-neutral-400 mb-1">Nomi (ixtiyoriy)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Asana" className={inputCls} />
          </div>
          {formError && <p className="text-[11px] text-red-400">{formError}</p>}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowForm(false); setFormError(""); }}
              className="px-3 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white cursor-pointer"
            >
              Bekor
            </button>
            <button
              onClick={add}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-200 disabled:opacity-50 cursor-pointer"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Saqlash va tekshirish
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-neutral-500 text-sm">Yuklanmoqda...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-neutral-800 rounded-xl bg-neutral-950/40">
          <Plug className="w-9 h-9 text-neutral-600 mx-auto mb-3" />
          <p className="text-sm text-neutral-300">Hali connector yo‘q</p>
          <p className="text-xs text-neutral-500 mt-1">MCP server URL‘ini qo‘shing — AI uning asboblaridan foydalanadi.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((c) => {
            const t = tests[c.id] || {};
            return (
              <div key={c.id} className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60">
                <div className="flex items-center gap-3">
                  <Plug className={`w-4 h-4 shrink-0 ${c.enabled ? "text-white" : "text-neutral-600"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-100 truncate">{c.name}</p>
                    <p className="text-[11px] text-neutral-500 truncate">{c.url}</p>
                  </div>
                  <button
                    onClick={() => runTest(c.id, { url: c.url, headers: c.headers, name: c.name })}
                    title="Tekshirish"
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
                  >
                    {t.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                  <Switch on={c.enabled} onChange={() => toggle(c)} />
                  <button onClick={() => remove(c)} title="O‘chirish" className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-800 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {t.ok === true && (
                  <div className="mt-2.5 pt-2.5 border-t border-neutral-800">
                    <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Ulandi · {t.tools?.length || 0} ta asbob · {t.ms} ms
                    </p>
                    {!!t.tools?.length && (
                      <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                        {t.tools.slice(0, 12).map((x) => x.name).join(", ")}
                        {t.tools.length > 12 ? ` … +${t.tools.length - 12}` : ""}
                      </p>
                    )}
                  </div>
                )}
                {t.ok === false && (
                  <p className="mt-2.5 pt-2.5 border-t border-neutral-800 text-[11px] text-red-400 flex items-start gap-1">
                    <X className="w-3 h-3 mt-0.5 shrink-0" /> {t.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
