import { NextRequest, NextResponse } from "next/server";
import { cleanServerUrl, MRAI_AUTH_TOKEN } from "@/lib/serverAuth";
import { sessionUserFromRequest } from "@/lib/session";

// Browser -> (this route, the token is added on the server) -> local MR AI server.
// Faqat ma'lumotlar bazasi va jobs endpointlari; /exec alohida route orqali.
export const dynamic = "force-dynamic";

const ALLOWED = ["api/db", "api/jobs"];

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!MRAI_AUTH_TOKEN) {
    return NextResponse.json({ error: "MRAI_AUTH_TOKEN is not configured" }, { status: 503 });
  }
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const { path } = await ctx.params;
  const joined = (path || []).join("/");
  const ok = ALLOWED.some((p) => joined === p || joined.startsWith(p + "/"));
  if (!ok || joined.includes("..")) {
    return NextResponse.json({ error: "This path is not allowed" }, { status: 403 });
  }

  const base = cleanServerUrl(req.headers.get("x-server-url"));
  const target = `${base}/${joined}${req.nextUrl.search}`;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.text() : undefined;

  try {
    const res = await fetch(target, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
        Authorization: `Bearer ${MRAI_AUTH_TOKEN}`,
        "x-mrai-user": user,
      },
      body: body || undefined,
      signal: AbortSignal.timeout(60000),
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Could not connect to the server: ${e?.message || "error"}` }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
