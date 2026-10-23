"use client";

import { useEffect, useState } from "react";
import { Code, Download, Eye, ExternalLink, RotateCw, X } from "lucide-react";
import Md from "./chat/Markdown";
import { extOf, fileUrl, fmtSize, kindOf, type FileRef } from "./chat/fileKind";

const TEXT_LIMIT = 2 * 1024 * 1024;

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.error) return String(j.error);
  } catch {}
  return `Xato (HTTP ${res.status})`;
}

export default function FilePanel({
  file,
  onClose,
  width = 420,
  onWidthChange,
}: {
  file: FileRef | null;
  onClose: () => void;
  width?: number;
  onWidthChange?: (w: number) => void;
}) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [text, setText] = useState<string | null>(null);
  const [entries, setEntries] = useState<{ list: string[]; truncated: boolean } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rev, setRev] = useState(0);

  const kind = file ? kindOf(file.name) : "other";
  const path = file?.path;
  const size = file?.size ?? 0;

  useEffect(() => {
    setTab("preview");
    setText(null);
    setEntries(null);
    setError("");
    if (!path) return;
    const needText = kind === "markdown" || kind === "text" || kind === "html";
    if (!needText && kind !== "archive") return;
    if (needText && size > TEXT_LIMIT) {
      if (kind !== "html") setError("Fayl juda katta, ko‘rib bo‘lmaydi — yuklab oling.");
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(fileUrl(path, kind === "archive" ? { list: true } : {}), { signal: ac.signal });
        if (!res.ok) throw new Error(await readError(res));
        if (kind === "archive") {
          const j = await res.json();
          setEntries({ list: j.entries || [], truncated: !!j.truncated });
        } else {
          setText(await res.text());
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message || "Yuklab bo‘lmadi");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [path, rev, kind, size]);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, onClose]);

  if (!file) return null;

  const url = fileUrl(file.path);
  const hasCode = kind === "html" || kind === "markdown";
  const btn =
    "h-8 w-8 inline-flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.08] transition cursor-pointer";

  const placeholder = (msg: string) => (
    <div className="h-full flex items-center justify-center p-6 text-sm text-neutral-500 text-center font-mono">{msg}</div>
  );

  let body: React.ReactNode;
  if (error) body = placeholder(error);
  else if (loading && !(kind === "html" && tab === "preview")) body = placeholder("Yuklanmoqda…");
  else if (tab === "code" && text !== null)
    body = <pre className="m-0 p-4 overflow-auto h-full font-mono text-[12.5px] leading-6 text-neutral-200 whitespace-pre">{text}</pre>;
  else if (kind === "html")
    body = (
      <iframe key={rev} src={url} title={file.name} sandbox="allow-scripts allow-forms allow-popups allow-modals" className="w-full h-full border-0 bg-white" />
    );
  else if (kind === "image")
    body = (
      <div className="h-full overflow-auto flex p-4 bg-[#111]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={rev} src={url} alt={file.name} className="max-w-full max-h-full m-auto object-contain" />
      </div>
    );
  else if (kind === "pdf") body = <iframe key={rev} src={url} title={file.name} className="w-full h-full border-0 bg-neutral-900" />;
  else if (kind === "video")
    body = (
      <div className="h-full flex items-center justify-center bg-black">
        <video key={rev} src={url} controls className="max-w-full max-h-full" />
      </div>
    );
  else if (kind === "audio")
    body = (
      <div className="h-full flex items-center justify-center p-6">
        <audio key={rev} src={url} controls className="w-full max-w-md" />
      </div>
    );
  else if (kind === "markdown" && text !== null)
    body = (
      <div className="h-full overflow-auto px-6 py-5 text-[15px] text-neutral-200">
        <Md text={text} />
      </div>
    );
  else if (kind === "text" && text !== null)
    body = <pre className="m-0 p-4 overflow-auto h-full font-mono text-[12.5px] leading-6 text-neutral-200 whitespace-pre">{text}</pre>;
  else if (kind === "archive" && entries)
    body = (
      <div className="h-full overflow-auto p-4 font-mono text-[12.5px] leading-6 text-neutral-300">
        <div className="mb-2 text-neutral-500 font-sans text-xs">Arxiv ichida{entries.truncated ? " (dastlabki 400 ta)" : ""}:</div>
        {entries.list.length ? entries.list.map((e, i) => <div key={i} className="truncate">{e}</div>) : <div className="text-neutral-500">Ro‘yxatni o‘qib bo‘lmadi.</div>}
      </div>
    );
  else body = placeholder("Bu fayl turini ko‘rib bo‘lmaydi — yuklab oling.");

  function startResize(e: React.MouseEvent) {
    if (!onWidthChange) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      const dx = startX - ev.clientX;
      const next = Math.min(Math.max(startW + dx, 280), Math.floor(window.innerWidth * 0.72));
      onWidthChange(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <aside
      className="relative flex flex-col bg-[#2d2d2d] border-[#1b1b1b] fixed inset-0 z-50 w-full md:static md:z-auto md:shrink-0 md:border-l-2 md:h-full" data-fp
      style={{
        // md+ da kenglik; mobile fixed full-screen class bilan
        ...({ ["--fp-w" as string]: `${width}px` } as React.CSSProperties),
      }}
    >
      <style>{`@media (min-width: 768px) { aside[data-fp] { width: var(--fp-w) !important; min-width: 280px; max-width: 72vw; } }`}</style>
      {/* Desktop resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Tortib o‘lchamini o‘zgartiring"
        onMouseDown={startResize}
        className="hidden md:block absolute left-0 top-0 bottom-0 w-2 -ml-1 z-30 cursor-col-resize"
      >
        <div className="h-full w-0.5 mx-auto hover:bg-[#5b8c3e] active:bg-[#5b8c3e] transition-colors" />
      </div>

      <div className="flex items-center justify-between gap-3 h-11 px-3 border-b-2 border-[#1b1b1b] shrink-0">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-neutral-100">{file.name}</div>
          <div className="text-[11px] text-neutral-500">
            {(extOf(file.name) || "fayl").toUpperCase()}
            {file.size ? ` · ${fmtSize(file.size)}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {hasCode && (
            <div className="flex items-center mr-1 border-2 border-[#1b1b1b] text-xs">
              <button
                onClick={() => setTab("preview")}
                className={`flex items-center gap-1 px-2.5 py-1 cursor-pointer ${
                  tab === "preview" ? "bg-[#5b8c3e] text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ko‘rinish</span>
              </button>
              <button
                onClick={() => setTab("code")}
                className={`flex items-center gap-1 px-2.5 py-1 cursor-pointer ${
                  tab === "code" ? "bg-[#5b8c3e] text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kod</span>
              </button>
            </div>
          )}
          <button className={btn} title="Qayta yuklash" onClick={() => setRev((v) => v + 1)}>
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          {(kind === "html" || kind === "pdf" || kind === "image") && (
            <a className={btn} title="Yangi oynada" href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <a className={btn} title="Yuklab olish" href={fileUrl(file.path, { dl: true })} download={file.name}>
            <Download className="w-3.5 h-3.5" />
          </a>
          <button className={btn} title="Yopish (Esc)" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">{body}</div>
    </aside>
  );
}
