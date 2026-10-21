import { NextRequest, NextResponse } from "next/server";
import { cleanServerUrl, MRAI_AUTH_TOKEN } from "@/lib/serverAuth";

// Brauzer -> (shu route, token serverda qo'shiladi) -> local MR AI server.
// Faqat ma'lumotlar bazasi va jobs endpointlari; /exec alohida route orqali.
export const dynamic = "force-dynamic";

const ALLOWED = ["api/db", "api/jobs"];

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!MRAI_AUTH_TOKEN) {
    return NextResponse.json({ error: "MRAI_AUTH_TOKEN sozlanmagan" }, { status: 503 });
  }
  const { path } = await ctx.params;
  const joined = (path || []).join("/");
  const ok = ALLOWED.some((p) => joined === p || joined.startsWith(p + "/"));
  if (!ok || joined.includes("..")) {
    return NextResponse.json({ error: "Bu yo'l ruxsat etilmagan" }, { status: 403 });
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
    return NextResponse.json({ error: `Serverga ulanib bo'lmadi: ${e?.message || "xato"}` }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
