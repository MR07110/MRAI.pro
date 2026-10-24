import { NextRequest, NextResponse } from "next/server";
import { cleanServerUrl, MRAI_AUTH_TOKEN } from "@/lib/serverAuth";
import { sessionUserFromRequest } from "@/lib/session";

// File "runner": the file stays on the computer and is STREAMED to the browser (never loaded into memory).
// Opening a 1 MB file and a 1 TB file takes the same time: only the path is passed, bytes flow on demand.
//   ?path=/abs/file            stream (supports Range, ETag/304: cached, but never stale)
//   ?path=...&dl=1             download straight from the computer (always the latest version)
//   ?path=...&op=stat          metadata (exists, size, mtime, mime, text?, etag)
//   ?path=...&list=1           archive / folder listing (zip reads only the central directory)
//   &v=<etag>                  version-pinned URL: browser may cache it "forever" (the URL changes when the file does)
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INLINE_EXACT = new Set(["application/pdf"]);
const BY_EXT: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", svg: "image/svg+xml",
  md: "text/plain; charset=utf-8", markdown: "text/plain; charset=utf-8",
  json: "text/plain; charset=utf-8", csv: "text/plain; charset=utf-8", tsv: "text/plain; charset=utf-8",
};

const ERR: Record<string, [string, number]> = {
  not_found: ["File not found. It may have been moved or deleted.", 404],
  permission_denied: ["Permission denied.", 403],
  forbidden: ["File access is disabled for this account.", 403],
  bad_path: ["Invalid path (an absolute path is required).", 400],
  not_a_file: ["This path is not a regular file.", 400],
  not_archive: ["Not a supported archive.", 415],
};

function err(code: string, status?: number, detail?: string) {
  const [msg, st] = ERR[code] || [detail || code || "File error", status || 502];
  return NextResponse.json({ error: msg, code }, { status: status || st, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  if (!MRAI_AUTH_TOKEN) return NextResponse.json({ error: "MRAI_AUTH_TOKEN is not configured" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  const path = sp.get("path") || "";
  if (!path.startsWith("/") || path.includes("\0") || path.length > 4096) return err("bad_path");

  const op = sp.get("list") ? "list" : sp.get("op") === "stat" ? "stat" : "get";
  const base = cleanServerUrl(undefined);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${MRAI_AUTH_TOKEN}`,
    "x-mrai-user": user,
    "ngrok-skip-browser-warning": "1",
  };
  for (const h of ["range", "if-none-match", "if-range"]) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }

  try {
    const url = `${base}/file?path=${encodeURIComponent(path)}&op=${op}`;
    if (op !== "get") {
      const r = await fetch(url, { headers, signal: AbortSignal.any([AbortSignal.timeout(20000), req.signal]) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return err(String(j?.error || ""), r.status, j?.detail);
      return NextResponse.json(j, { headers: { "Cache-Control": "no-store" } });
    }

    // Stream: no total timeout (large files), cancelled when the browser disconnects.
    const up = await fetch(url, { headers, signal: req.signal });
    if (up.status === 304) {
      return new Response(null, { status: 304, headers: { ETag: up.headers.get("etag") || "", "Cache-Control": "private, no-cache, no-transform" } });
    }
    if (!up.ok && up.status !== 206 && up.status !== 416) {
      const j = await up.json().catch(() => ({}));
      return err(String(j?.error || ""), up.status, j?.detail);
    }

    const name = path.split("/").pop() || "file";
    const ext = (/\.([A-Za-z0-9]+)$/.exec(name)?.[1] || "").toLowerCase();
    const mime = (up.headers.get("x-file-mime") || "").toLowerCase();
    const isText = up.headers.get("x-file-text") === "1";
    const download = sp.get("dl") === "1";

    let type = "application/octet-stream";
    let inline = false;
    const out = new Headers();
    out.set("X-Content-Type-Options", "nosniff");
    if (BY_EXT[ext]) {
      type = BY_EXT[ext];
      inline = true;
      // Own (opaque) origin: the page can't reach site cookies/API even if opened directly.
      if (ext === "html" || ext === "htm") out.set("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads");
      if (ext === "svg") out.set("Content-Security-Policy", "sandbox");
    } else if (/^(image|video|audio)\//.test(mime) || INLINE_EXACT.has(mime)) {
      type = mime;
      inline = true;
    } else if (isText) {
      type = "text/plain; charset=utf-8";
      inline = true;
    }

    out.set("Content-Type", type);
    out.set("Accept-Ranges", "bytes");
    for (const h of ["content-length", "content-range", "etag", "last-modified"]) {
      const v = up.headers.get(h);
      if (v) out.set(h, v);
    }
    // download -> never cached (always the newest bytes from disk). Version-pinned URL -> cache for a long time.
    // Otherwise: cache, but revalidate every time (fast 304, never shows an old version).
    const etag = (up.headers.get("etag") || "").replace(/"/g, "");
    const pinned = !!sp.get("v") && sp.get("v") === etag;
    out.set(
      "Cache-Control",
      download ? "private, no-store" : pinned ? "private, max-age=31536000, immutable, no-transform" : "private, no-cache, no-transform"
    );
    const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    out.set("Content-Disposition", `${download || !inline ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    return new Response(up.body, { status: up.status, headers: out });
  } catch (e: any) {
    if (e?.name === "AbortError") return new Response(null, { status: 499 });
    return err("", 502, e?.message || "Could not reach the computer server");
  }
}
