import { NextRequest, NextResponse } from "next/server";
import { serverFetch } from "@/lib/serverAuth";
import { sessionUserFromRequest } from "@/lib/session";

// Kompyuterdagi faylni brauzerga beradi (chatdagi fayl kartochkalari va preview paneli uchun).
// Ruxsat Python serverning /exec qoidasi bo'yicha (x-mrai-user): buyruq bajara olmaydigan hisob fayl ham ololmaydi.
// Fayl /exec orqali bo'laklab (dd + base64) o'qiladi: stdout chegarasi 500000 belgi.
export const dynamic = "force-dynamic";

const MAX_BYTES = 80 * 1024 * 1024;
const CHUNK = 340000; // 340000 bayt -> ~453k base64 belgi (< 500000)
const PARALLEL = 4;

const TEXT = new Set([
  "txt", "md", "markdown", "json", "js", "mjs", "cjs", "ts", "tsx", "jsx", "css", "csv", "tsv", "xml", "yml", "yaml",
  "toml", "sh", "bash", "fish", "py", "rs", "go", "c", "h", "cpp", "hpp", "java", "kt", "log", "ini", "conf", "sql", "kdl", "lua", "rb", "php",
]);
const BINARY_INLINE: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  bmp: "image/bmp", ico: "image/x-icon", pdf: "application/pdf",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
};

function shq(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

async function sh(user: string, command: string, timeout = 25) {
  const r = await serverFetch(undefined, "/exec", {
    body: { command, timeout },
    timeoutMs: (timeout + 15) * 1000,
    user,
  });
  return r as { stdout: string; stderr: string; exit_code: number };
}

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  const user = await sessionUserFromRequest(req);
  if (!user) return err("Kirish talab qilinadi", 401);

  const sp = req.nextUrl.searchParams;
  const path = sp.get("path") || "";
  if (!path.startsWith("/") || path.includes("\0") || path.length > 4096) return err("Yo'l noto'g'ri (to'liq yo'l kerak)", 400);

  try {
    const st = await sh(user, `[ -f ${shq(path)} ] && stat -c %s -- ${shq(path)}`);
    const size = parseInt(String(st.stdout || "").trim(), 10);
    if (st.exit_code !== 0 || !Number.isFinite(size)) return err("Fayl topilmadi", 404);

    // Arxiv ichidagi fayllar ro'yxati
    if (sp.get("list")) {
      const cmd =
        `f=${shq(path)}; case "$f" in *.zip|*.ZIP) (unzip -Z1 "$f" 2>/dev/null || bsdtar -tf "$f" 2>/dev/null || ` +
        `python3 -c 'import sys,zipfile;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))' "$f") ;; ` +
        `*) tar -tf "$f" 2>/dev/null ;; esac | head -400`;
      const r = await sh(user, cmd);
      const entries = String(r.stdout || "").split("\n").filter(Boolean);
      return NextResponse.json({ entries, truncated: entries.length >= 400, size });
    }

    if (size > MAX_BYTES) return err(`Fayl juda katta (${Math.round(size / 1048576)} MB, chegara ${MAX_BYTES / 1048576} MB)`, 413);

    const n = Math.ceil(size / CHUNK);
    const parts: Buffer[] = new Array(n);
    for (let i = 0; i < n; i += PARALLEL) {
      await Promise.all(
        Array.from({ length: Math.min(PARALLEL, n - i) }, async (_, k) => {
          const idx = i + k;
          const r = await sh(user, `dd if=${shq(path)} bs=${CHUNK} skip=${idx} count=1 status=none | base64 -w0`);
          if (r.exit_code !== 0) throw new Error(`O'qishda xato: ${String(r.stderr || "").slice(0, 160)}`);
          parts[idx] = Buffer.from(String(r.stdout || "").trim(), "base64");
        })
      );
    }
    const body = Buffer.concat(parts);
    if (body.length !== size) return err("Fayl to'liq o'qilmadi (hajm mos kelmadi)", 502);

    const name = path.split("/").pop() || "file";
    const ext = (/\.([A-Za-z0-9]+)$/.exec(name)?.[1] || "").toLowerCase();
    const download = sp.get("dl") === "1";

    let type = "application/octet-stream";
    let inline = false;
    const headers: Record<string, string> = {
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    };
    if (ext === "html" || ext === "htm") {
      type = "text/html; charset=utf-8";
      inline = true;
      // Alohida (opaque) origin: sayt cookie/API ga kira olmaydi, hatto to'g'ridan-to'g'ri ochilsa ham.
      headers["Content-Security-Policy"] = "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads";
    } else if (ext === "svg") {
      type = "image/svg+xml";
      inline = true;
      headers["Content-Security-Policy"] = "sandbox";
    } else if (BINARY_INLINE[ext]) {
      type = BINARY_INLINE[ext];
      inline = true;
    } else if (TEXT.has(ext)) {
      type = "text/plain; charset=utf-8";
      inline = true;
    }

    const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    headers["Content-Type"] = type;
    headers["Content-Length"] = String(body.length);
    headers["Content-Disposition"] = `${download || !inline ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
    return new Response(new Uint8Array(body), { headers });
  } catch (e: any) {
    return err(e?.message || "Server bilan aloqa xatosi", 502);
  }
}
