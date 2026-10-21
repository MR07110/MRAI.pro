import { NextRequest, NextResponse } from "next/server";
import { cleanServerUrl, MRAI_AUTH_TOKEN } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!MRAI_AUTH_TOKEN) {
    return NextResponse.json(
      { stdout: "", stderr: "MRAI_AUTH_TOKEN sozlanmagan (.env.local yoki Vercel env)", exit_code: 1 },
      { status: 200 }
    );
  }
  try {
    const body = await req.json();
    const base = cleanServerUrl(req.headers.get("x-server-url"));

    const res = await fetch(`${base}/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
        Authorization: `Bearer ${MRAI_AUTH_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { stdout: "", stderr: `Serverga ulanish xatosi: ${err.message || "Ulanib bo‘lmadi"}`, exit_code: 1 },
      { status: 200 }
    );
  }
}
