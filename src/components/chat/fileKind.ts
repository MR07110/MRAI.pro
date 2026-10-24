export type FileRef = { path: string; name: string; size: number };
export type FileKind = "html" | "image" | "pdf" | "markdown" | "text" | "video" | "audio" | "archive" | "dir" | "other";

// Live metadata from the computer (/api/files?op=stat)
export type FileInfo = {
  exists: boolean;
  type: "file" | "dir";
  name: string;
  size: number;
  mtime: number; // seconds
  etag: string;
  mime?: string | null;
  text?: boolean;
};

const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg"]);
const VIDEO = new Set(["mp4", "webm", "mov", "m4v", "mkv"]);
const AUDIO = new Set(["mp3", "wav", "ogg", "m4a", "flac", "opus"]);
const ARCHIVE = new Set(["zip", "tar", "tgz", "gz", "xz", "bz2", "7z", "rar", "jar", "whl", "apk"]);
const TEXT = new Set([
  "txt", "json", "js", "mjs", "cjs", "ts", "tsx", "jsx", "css", "scss", "csv", "tsv", "xml", "yml", "yaml", "toml", "sh", "bash", "fish", "zsh",
  "py", "rs", "go", "c", "h", "cpp", "hpp", "java", "kt", "swift", "log", "ini", "conf", "env", "sql", "kdl", "lua", "rb", "php", "vue", "svelte",
  "gitignore", "dockerfile", "makefile", "lock",
]);

export function extOf(name: string): string {
  if (/\.tar\.(gz|xz|bz2)$/i.test(name)) return "tar." + name.split(".").pop()!.toLowerCase();
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

// By extension only (instant, before the file is inspected)
export function kindOf(name: string): FileKind {
  const e = extOf(name);
  if (e === "html" || e === "htm") return "html";
  if (e === "md" || e === "markdown") return "markdown";
  if (e === "pdf") return "pdf";
  if (IMAGE.has(e)) return "image";
  if (VIDEO.has(e)) return "video";
  if (AUDIO.has(e)) return "audio";
  if (ARCHIVE.has(e) || e.startsWith("tar.")) return "archive";
  if (TEXT.has(e)) return "text";
  return "other";
}

// Smart: extension first, then what the file really is (magic bytes / text sniffing on the computer)
export function smartKind(name: string, info?: FileInfo | null): FileKind {
  if (info?.type === "dir") return "dir";
  const k = kindOf(name);
  if (k !== "other" || !info) return k;
  const m = (info.mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf") return "pdf";
  if (/zip|gzip|x-7z|rar|bzip2|x-xz|x-tar/.test(m)) return "archive";
  if (info.text) return "text";
  return "other";
}

export function fmtSize(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB", "PB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

export function fmtAgo(tsSeconds: number): string {
  const d = Math.max(0, Date.now() / 1000 - tsSeconds);
  if (d < 10) return "just now";
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(tsSeconds * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function fileUrl(
  path: string,
  opts: { dl?: boolean; list?: boolean; stat?: boolean; v?: string } = {}
): string {
  return (
    `/api/files?path=${encodeURIComponent(path)}` +
    (opts.dl ? "&dl=1" : "") +
    (opts.list ? "&list=1" : "") +
    (opts.stat ? "&op=stat" : "") +
    (opts.v ? `&v=${encodeURIComponent(opts.v)}` : "")
  );
}

export function baseName(path: string): string {
  return path.split("/").pop() || path;
}

// ---- Speed: remember what was already read from the computer. Keys contain the file's etag, so a changed file
// ---- always misses the cache (an old version can never be shown).
export const textCache = new Map<string, string>();
export const listCache = new Map<string, { list: string[]; total: number | null; truncated: boolean }>();
export function cachePut<T>(m: Map<string, T>, k: string, v: T, max = 60) {
  if (m.size >= max) m.delete(m.keys().next().value as string);
  m.set(k, v);
}

const TEXT_PREFETCH = 512 * 1024;
const warmed = new Set<string>();

// Warm up a file before it is opened (hover / focus / touch). Only the path travels; small files are pulled into
// the HTTP cache under their version-pinned URL, text files into textCache (first 512 KB only).
export async function prefetchFile(path: string, name: string): Promise<void> {
  try {
    const r = await fetch(fileUrl(path, { stat: true }), { cache: "no-store" });
    if (!r.ok) return;
    const info = (await r.json()) as FileInfo;
    if (!info?.exists || info.type !== "file") return;
    const key = `${path}|${info.etag}`;
    if (warmed.has(key)) return;
    warmed.add(key);
    if (warmed.size > 200) warmed.clear();
    const k = smartKind(name, info);
    if (k === "markdown" || k === "text") {
      const ck = `${path}|${info.etag}|${TEXT_PREFETCH}`;
      if (textCache.has(ck)) return;
      const res = await fetch(fileUrl(path, { v: info.etag }), { headers: { Range: `bytes=0-${TEXT_PREFETCH - 1}` } });
      if (res.ok) cachePut(textCache, ck, new TextDecoder("utf-8").decode(await res.arrayBuffer()));
    } else if ((k === "html" || k === "image" || k === "pdf") && info.size <= 8 * 1024 * 1024) {
      const res = await fetch(fileUrl(path, { v: info.etag }));
      if (res.ok) await res.arrayBuffer();
    }
  } catch {
    /* prefetch is best-effort */
  }
}
