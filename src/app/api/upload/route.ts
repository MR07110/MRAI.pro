import { NextRequest, NextResponse } from "next/server";
import { cleanServerUrl, MRAI_AUTH_TOKEN } from "@/lib/serverAuth";
import { sessionUserFromRequest } from "@/lib/session";

// Upload a file to the computer: the browser sends it here, we stream it to the local server, which saves it
// under ~/.mrai/workspace/uploads and returns its absolute path. The chat then shows it as a file card (and the
// agent can read it) through exactly the same /api/files path as every other file on the computer.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 50 * 1024 * 1024 * 1024; // 50 GB

export async function POST(req: NextRequest) {
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  if (!MRAI_AUTH_TOKEN) return NextResponse.json({ error: "MRAI_AUTH_TOKEN is not configured" }, { status: 503 });

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "File is too large" }, { status: 413 });

  try {
    const base = cleanServerUrl(undefined);
    const r = await fetch(`${base}/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MRAI_AUTH_TOKEN}`,
        "x-mrai-user": user,
        "x-filename": encodeURIComponent(file.name || "file"),
        "Content-Type": "application/octet-stream",
        "Content-Length": String(file.size),
        "ngrok-skip-browser-warning": "1",
      },
      body: file.stream(),
      // Node's fetch requires this to stream a request body.
      duplex: "half",
      signal: req.signal,
    } as RequestInit & { duplex: "half" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ error: j?.error || "Upload failed" }, { status: r.status });
    return NextResponse.json(j, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not reach the computer server" }, { status: 502 });
  }
}
