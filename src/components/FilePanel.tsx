"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Code, Copy, Download, Eye, ExternalLink, FileQuestion, Folder, RotateCw, Table2, TriangleAlert, X } from "lucide-react";
import Md from "./chat/Markdown";
import Highlight from "./chat/Highlight";
import { cachePut, extOf, fileUrl, fmtAgo, fmtSize, listCache, smartKind, textCache, type FileInfo, type FileRef } from "./chat/fileKind";

const MIN_W = 320; // smallest panel width
const MIN_CHAT = 400; // room kept for the chat on desktop
const TEXT_FIRST = 512 * 1024; // text preview reads only the first 512 KB (Range request)
const TEXT_STEP = 2 * 1024 * 1024;
const TEXT_MAX = 16 * 1024 * 1024;

function parseCsv(text: string, delim: string, maxRows: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if ((cur || row.length) && rows.length < maxRows) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

export default function FilePanel({
  file,
  onClose,
  width = null,
  onWidthChange,
}: {
  file: FileRef | null;
  onClose: () => void;
  width?: number | null; // null = automatic (depends on the screen)
  onWidthChange?: (w: number | null) => void;
}) {
  const [tab, setTab] = useState<"preview" | "raw">("preview");
  const [text, setText] = useState<string | null>(null);
  const [textBytes, setTextBytes] = useState(TEXT_FIRST);
  const [entries, setEntries] = useState<{ list: string[]; total: number | null; truncated: boolean } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rev, setRev] = useState(0);
  const [info, setInfo] = useState<FileInfo | null>(null);
  const infoRef = useRef<FileInfo | null>(null);
  const [missing, setMissing] = useState("");
  const [updatedAt, setUpdatedAt] = useState(0);
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);

  // ---- Responsive + size ----
  const panelRef = useRef<HTMLElement>(null);
  const latest = useRef(0);
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  const [avail, setAvail] = useState(0);
  const [live, setLive] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    window.addEventListener("resize", onR);
    onR();
    return () => window.removeEventListener("resize", onR);
  }, []);

  const isOpen = !!file;
  useEffect(() => {
    const parent = panelRef.current?.parentElement;
    if (!parent || !isOpen) return;
    const measure = () => {
      const cs = getComputedStyle(parent);
      setAvail(Math.max(0, parent.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [isOpen]);

  // mobile < 768: full screen | tablet 768–1023: overlay from the right | desktop ≥1024: beside the chat
  const mode: "mobile" | "tablet" | "desktop" = vw < 768 ? "mobile" : vw < 1024 ? "tablet" : "desktop";
  const room = mode === "desktop" ? avail || vw : vw;
  const maxW = mode === "desktop" ? Math.max(MIN_W, room - MIN_CHAT) : Math.max(MIN_W, Math.floor(vw * 0.92));
  const clampW = (n: number) => Math.min(Math.max(Math.round(n), MIN_W), maxW);
  const defW = mode === "desktop" ? Math.min(Math.max(Math.round(room * 0.45), 420), 760) : Math.round(vw * 0.7);
  const w = clampW(live ?? width ?? defW);

  const path = file?.path;
  const name = file?.name || "";
  const kind = smartKind(name, info);
  const ext = extOf(name);
  const isCsv = kind === "text" && (ext === "csv" || ext === "tsv");
  const etag = info?.etag;
  const hasTabs = kind === "html" || kind === "markdown" || isCsv;

  // New file: reset everything (the previous file must never leak into the next one)
  useEffect(() => {
    infoRef.current = null;
    setInfo(null);
    setMissing("");
    setTab("preview");
    setText(null);
    setEntries(null);
    setError("");
    setTextBytes(TEXT_FIRST);
    setUpdatedAt(0);
  }, [path]);

  // The computer is the source of truth: a tiny stat request (works the same for 1 MB or 1 TB).
  // It also watches the file: when it changes on disk the preview refreshes by itself.
  useEffect(() => {
    if (!path) return;
    let stop = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const r = await fetch(fileUrl(path, { stat: true }), { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (stop) return;
        if (r.ok && j?.exists) {
          setMissing("");
          const prev = infoRef.current;
          if (!prev || prev.etag !== j.etag) {
            if (prev) setUpdatedAt(Date.now());
            infoRef.current = j;
            setInfo(j);
          }
        } else if (r.status === 404 || r.status === 403 || r.status === 400 || r.status === 401) {
          infoRef.current = null;
          setInfo(null);
          setMissing(j?.error || `Error (HTTP ${r.status})`);
        }
      } catch {
        /* network blip: keep showing what we have */
      }
      if (!stop) timer = window.setTimeout(poll, document.hidden ? 8000 : 2500);
    };
    poll();
    return () => {
      stop = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [path]);

  // "Updated" badge fades out
  useEffect(() => {
    if (!updatedAt) return;
    const t = window.setTimeout(() => setTick((n) => n + 1), 4000);
    return () => window.clearTimeout(t);
  }, [updatedAt]);

  const wantText = !!info && info.type === "file" && (kind === "markdown" || kind === "text" || (kind === "html" && tab === "raw"));
  const wantList = !!info && (kind === "archive" || kind === "dir");

  // Content for text / listings. Only a slice is requested (Range) — never the whole file.
  useEffect(() => {
    if (!path || !info) return;
    if (wantText) {
      const ck = `${path}|${info.etag}|${textBytes}`;
      const hit = textCache.get(ck);
      if (hit !== undefined) {
        setText(hit);
        setError("");
        setLoading(false);
        return;
      }
      const ac = new AbortController();
      setLoading(true);
      setError("");
      (async () => {
        try {
          const res = await fetch(fileUrl(path, { v: info.etag }), { headers: { Range: `bytes=0-${textBytes - 1}` }, signal: ac.signal });
          if (res.status === 416) {
            setText("");
            return;
          }
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Error (HTTP ${res.status})`);
          const decoded = new TextDecoder("utf-8").decode(await res.arrayBuffer());
          if (decoded.length < 4 * 1024 * 1024) cachePut(textCache, ck, decoded);
          setText(decoded);
        } catch (e: any) {
          if (e?.name !== "AbortError") setError(e?.message || "Could not load");
        } finally {
          if (!ac.signal.aborted) setLoading(false);
        }
      })();
      return () => ac.abort();
    }
    if (wantList) {
      const lk = `${path}|${info.etag}`;
      const lhit = listCache.get(lk);
      if (lhit) {
        setEntries(lhit);
        setError("");
        setLoading(false);
        return;
      }
      const ac = new AbortController();
      setLoading(true);
      setError("");
      (async () => {
        try {
          const res = await fetch(fileUrl(path, { list: true }), { signal: ac.signal, cache: "no-store" });
          const j = await res.json().catch(() => null);
          if (!res.ok) throw new Error(j?.error || `Error (HTTP ${res.status})`);
          const ent = { list: j.entries || [], total: j.total ?? null, truncated: !!j.truncated };
          cachePut(listCache, lk, ent);
          setEntries(ent);
        } catch (e: any) {
          if (e?.name !== "AbortError") setError(e?.message || "Could not load");
        } finally {
          if (!ac.signal.aborted) setLoading(false);
        }
      })();
      return () => ac.abort();
    }
  }, [path, info?.etag, rev, wantText, wantList, textBytes]);

  const csvRows = useMemo(
    () => (isCsv && text ? parseCsv(text, ext === "tsv" ? "\t" : ",", 501) : []),
    [isCsv, text, ext]
  );

  if (!file) return null;

  const verUrl = path && etag ? fileUrl(path, { v: etag }) : "";
  const size = info?.size ?? file.size;
  const btn =
    "h-8 w-8 max-md:h-10 max-md:w-10 inline-flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.08] transition cursor-pointer";
  const freshlyUpdated = updatedAt && Date.now() - updatedAt < 4000;

  // Copy is only for text — never images, PDFs, video/audio, archives or folders.
  const canCopy = !missing && text !== null && (kind === "markdown" || kind === "text" || isCsv || kind === "html");
  const handleCopy = async () => {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const placeholder = (msg: React.ReactNode) => (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-sm text-neutral-500 text-center font-mono">{msg}</div>
  );

  const downloadBtn = (
    <a
      href={fileUrl(file.path, { dl: true })}
      download={file.name}
      className="inline-flex items-center gap-1.5 h-9 px-3.5 border border-white/25 hover:bg-white hover:text-black text-[12px] text-white font-medium transition font-mono"
    >
      <Download className="w-3.5 h-3.5" />
      Download{size ? ` · ${fmtSize(size)}` : ""}
    </a>
  );

  let body: React.ReactNode;
  if (missing) {
    body = placeholder(
      <>
        <TriangleAlert className="w-5 h-5 text-amber-400" />
        <span className="max-w-xs break-words">{missing}</span>
        <span className="text-[11px] text-neutral-600 break-all max-w-xs">{file.path}</span>
        <span className="text-[11px] text-neutral-600">Checking again automatically…</span>
      </>
    );
  } else if (!info) body = placeholder("Loading…");
  else if (error) body = placeholder(error);
  else if (kind === "dir" || kind === "archive") {
    body = !entries ? (
      placeholder("Loading…")
    ) : (
      <div className="h-full overflow-auto p-4 font-mono text-[12.5px] leading-6 text-neutral-300">
        <div className="mb-2 text-neutral-500 font-sans text-xs">
          {kind === "dir" ? "Folder" : "Archive"} contents
          {entries.total != null ? ` · ${entries.total.toLocaleString()} items` : ""}
          {entries.truncated ? ` (showing first ${entries.list.length})` : ""}
        </div>
        {entries.list.length ? (
          entries.list.map((e, i) => (
            <div key={i} className="truncate flex items-center gap-2">
              {e.endsWith("/") && <Folder className="w-3.5 h-3.5 shrink-0 text-neutral-500" />}
              <span className="truncate">{e}</span>
            </div>
          ))
        ) : (
          <div className="text-neutral-500">Empty.</div>
        )}
      </div>
    );
  } else if (kind === "html" && tab === "preview")
    body = (
      <iframe
        key={`${etag}-${rev}`}
        src={verUrl}
        title={file.name}
        sandbox="allow-scripts allow-forms allow-popups allow-modals"
        className="w-full h-full border-0 bg-white"
      />
    );
  else if (kind === "image")
    body = (
      <div className="h-full overflow-auto flex p-4 bg-[#111]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={`${etag}-${rev}`} src={verUrl} alt={file.name} className="max-w-full max-h-full m-auto object-contain" />
      </div>
    );
  else if (kind === "pdf") body = <iframe key={`${etag}-${rev}`} src={verUrl} title={file.name} className="w-full h-full border-0 bg-neutral-900" />;
  else if (kind === "video")
    body = (
      <div className="h-full flex items-center justify-center bg-black">
        <video key={`${etag}-${rev}`} src={verUrl} controls preload="metadata" className="max-w-full max-h-full" />
      </div>
    );
  else if (kind === "audio")
    body = (
      <div className="h-full flex items-center justify-center p-6">
        <audio key={`${etag}-${rev}`} src={verUrl} controls preload="metadata" className="w-full max-w-md" />
      </div>
    );
  else if (kind === "markdown" && tab === "preview")
    body =
      text === null ? (
        placeholder("Loading…")
      ) : (
        <div className="h-full overflow-auto px-6 py-5 text-[15px] text-neutral-200">
          <Md text={text} />
        </div>
      );
  else if (isCsv && tab === "preview")
    body =
      text === null ? (
        placeholder("Loading…")
      ) : (
        <div className="h-full overflow-auto">
          <table className="border-collapse text-[12.5px] font-mono text-neutral-200">
            <tbody>
              {csvRows.map((r, i) => (
                <tr key={i} className={i === 0 ? "sticky top-0 bg-[#0a0a0a] text-white font-semibold" : "hover:bg-white/[0.04]"}>
                  <td className="px-2 py-1 text-neutral-600 border border-white/10 text-right select-none">{i === 0 ? "#" : i}</td>
                  {r.slice(0, 60).map((c, j) => (
                    <td key={j} className="px-3 py-1 border border-white/10 whitespace-nowrap max-w-[24rem] truncate" title={c}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  else if (wantText)
    body =
      text === null ? (
        placeholder(loading ? "Loading…" : "")
      ) : (
        <pre className="m-0 p-4 overflow-auto h-full font-mono text-[12.5px] leading-6 whitespace-pre">
          <Highlight code={text} language={kind === "html" ? "html" : ext} />
        </pre>
      );
  else
    body = placeholder(
      <>
        <FileQuestion className="w-6 h-6 text-neutral-500" />
        <span>No preview for this file type.</span>
        <span className="text-[11px] text-neutral-600">
          {info.mime || "unknown type"} · {fmtSize(info.size)} · modified {fmtAgo(info.mtime)}
        </span>
        {downloadBtn}
      </>
    );

  const showMore = !missing && !!info && wantText && info.size > textBytes && !(kind === "markdown" && tab === "preview" && false);

  // Pointer Events: mouse + touch (tablet/phone) + stylus; not interrupted over an iframe
  function onHandleDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
    const startX = e.clientX;
    const startW = w;
    latest.current = startW;
    setLive(startW);
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      const next = clampW(startW + (startX - ev.clientX)); // left = wider
      latest.current = next;
      setLive(next);
    };
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragging(false);
      setLive(null);
      onWidthChange?.(latest.current);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  function onHandleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 80 : 24;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onWidthChange?.(clampW(w + step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onWidthChange?.(clampW(w - step));
    }
  }

  const asideCls =
    mode === "mobile"
      ? "fixed inset-0 z-50 w-full panel-in-up"
      : mode === "tablet"
        ? "fixed inset-y-0 right-0 z-50 border-l shadow-[-12px_0_32px_rgba(0,0,0,0.6)] panel-in-right"
        : "relative shrink-0 h-full border-l panel-in-right";

  const canOpenTab = !missing && !!verUrl && kind !== "dir" && kind !== "archive" && kind !== "other";
  const [tabA, tabB] = isCsv ? ["Table", "Raw"] : ["Preview", "Code"];

  return (
    <>
      {mode === "tablet" && <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />}
      <aside
        ref={panelRef}
        // The panel is closed only with its X button: Esc pressed inside it never reaches anything else.
        onKeyDownCapture={(e) => {
          if (e.key === "Escape") e.stopPropagation();
        }}
        className={`flex flex-col bg-black border-white/15 ${asideCls}`}
        style={
          mode === "mobile"
            ? { paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }
            : { width: w }
        }
      >
        {/* Drag the left edge to resize: mouse / touch / keyboard (← →); double-click = automatic */}
        {mode !== "mobile" && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            aria-valuemin={MIN_W}
            aria-valuemax={maxW}
            aria-valuenow={w}
            tabIndex={0}
            title="Drag to resize · double-click to reset"
            onPointerDown={onHandleDown}
            onKeyDown={onHandleKey}
            onDoubleClick={() => onWidthChange?.(null)}
            className="group absolute left-0 top-0 bottom-0 w-3 md:max-lg:w-6 -translate-x-1/2 z-30 cursor-col-resize touch-none flex items-center justify-center outline-none"
          >
            <div
              className={`h-full w-px transition-colors ${
                dragging ? "bg-white" : "bg-transparent group-hover:bg-white/70 group-focus-visible:bg-white"
              }`}
            />
            <div
              className={`absolute h-10 w-1 transition-colors ${
                dragging ? "bg-white" : "bg-white/25 group-hover:bg-white group-focus-visible:bg-white"
              }`}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 h-12 px-3 border-b border-white/15 shrink-0">
          <div className="min-w-0" title={file.path}>
            <div className="truncate text-[13px] font-medium text-neutral-100">{file.name}</div>
            <div className="truncate text-[11px] text-neutral-500">
              {kind === "dir" ? "FOLDER" : (ext || "file").toUpperCase()}
              {size ? ` · ${fmtSize(size)}` : ""}
              {info ? ` · modified ${fmtAgo(info.mtime)}` : ""}
              {freshlyUpdated ? <span className="text-emerald-400"> · updated</span> : null}
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {hasTabs && !missing && (
              <div className="flex items-center mr-1 border-2 border-white/15 text-xs">
                <button
                  onClick={() => setTab("preview")}
                  className={`flex items-center gap-1 px-2.5 py-1 max-md:py-2 cursor-pointer ${
                    tab === "preview" ? "bg-white text-black" : "text-neutral-400 hover:text-black"
                  }`}
                >
                  {isCsv ? <Table2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{tabA}</span>
                </button>
                <button
                  onClick={() => setTab("raw")}
                  className={`flex items-center gap-1 px-2.5 py-1 max-md:py-2 cursor-pointer ${
                    tab === "raw" ? "bg-white text-black" : "text-neutral-400 hover:text-black"
                  }`}
                >
                  <Code className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tabB}</span>
                </button>
              </div>
            )}
            <button className={btn} title="Reload" onClick={() => setRev((v) => v + 1)}>
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            {canCopy && (
              <button className={btn} title={copied ? "Copied" : "Copy text"} onClick={handleCopy}>
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
            {canOpenTab && (
              <a className={btn} title="Open in new tab" href={verUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {kind !== "dir" && (
              <a className={btn} title="Download the latest version from your computer" href={fileUrl(file.path, { dl: true })} download={file.name}>
                <Download className="w-3.5 h-3.5" />
              </a>
            )}
            <button className={btn} title="Close" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* while dragging, the iframe must not swallow pointer events */}
        <div className={`flex-1 min-h-0 flex flex-col ${dragging ? "pointer-events-none" : ""}`}>
          <div className="flex-1 min-h-0">{body}</div>
          {showMore && (
            <div className="shrink-0 border-t border-white/15 px-3 h-9 flex items-center justify-between gap-3 text-[12px] text-neutral-500">
              <span className="truncate">
                Showing first {fmtSize(Math.min(textBytes, info!.size))} of {fmtSize(info!.size)}
              </span>
              {textBytes < TEXT_MAX ? (
                <button
                  onClick={() => setTextBytes((b) => Math.min(b + TEXT_STEP, TEXT_MAX))}
                  className="hover:text-white transition cursor-pointer shrink-0"
                >
                  Load more
                </button>
              ) : (
                <span className="shrink-0">Download to see the rest</span>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
