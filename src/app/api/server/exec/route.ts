import { NextRequest, NextResponse } from "next/server";
import { cleanServerUrl, MRAI_AUTH_TOKEN } from "@/lib/serverAuth";
import { sessionUserFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!MRAI_AUTH_TOKEN) {
    return NextResponse.json(
      { stdout: "", stderr: "MRAI_AUTH_TOKEN is not configured (.env.local or Vercel env)", exit_code: 1 },
      { status: 200 }
    );
  }
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ stdout: "", stderr: "Sign-in required", exit_code: 1 }, { status: 401 });
  try {
    const body = await req.json();
    const base = cleanServerUrl(req.headers.get("x-server-url"));

    const res = await fetch(`${base}/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
        Authorization: `Bearer ${MRAI_AUTH_TOKEN}`,
        "x-mrai-user": user,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { stdout: "", stderr: `Server connection error: ${err.message || "Could not connect"}`, exit_code: 1 },
      { status: 200 }
    );
  }
}
