export type FileRef = { path: string; name: string; size: number };
export type FileKind = "html" | "image" | "pdf" | "markdown" | "text" | "video" | "audio" | "archive" | "other";

const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg"]);
const VIDEO = new Set(["mp4", "webm", "mov"]);
const AUDIO = new Set(["mp3", "wav", "ogg", "m4a"]);
const ARCHIVE = new Set(["zip", "tar", "tgz", "gz", "xz", "bz2", "7z", "rar"]);
const TEXT = new Set([
  "txt", "json", "js", "mjs", "cjs", "ts", "tsx", "jsx", "css", "csv", "tsv", "xml", "yml", "yaml", "toml", "sh", "bash", "fish",
  "py", "rs", "go", "c", "h", "cpp", "hpp", "java", "kt", "log", "ini", "conf", "sql", "kdl", "lua", "rb", "php",
]);

export function extOf(name: string): string {
  if (/\.tar\.(gz|xz|bz2)$/i.test(name)) return "tar." + name.split(".").pop()!.toLowerCase();
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

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

export function fmtSize(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
}

export function fileUrl(path: string, opts: { dl?: boolean; list?: boolean } = {}): string {
  return `/api/files?path=${encodeURIComponent(path)}${opts.dl ? "&dl=1" : ""}${opts.list ? "&list=1" : ""}`;
}

export function baseName(path: string): string {
  return path.split("/").pop() || path;
}
