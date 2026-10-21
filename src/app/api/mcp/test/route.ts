import { NextRequest, NextResponse } from "next/server";
import { McpClient } from "@/lib/mcp";
import { isAuthorized } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Connectorni tekshiradi va tool ro'yxatini qaytaradi.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "Ruxsat yo'q (token)" }, { status: 401 });
  const t0 = Date.now();
  let client: McpClient | null = null;
  try {
    const { url, headers, name } = await req.json();
    client = new McpClient({ name: name || "test", url, headers: headers || {} }, 25000);
    await Promise.race([
      client.connect(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("ulanish vaqti tugadi (20s)")), 20000)),
    ]);
    const tools = await client.listTools();
    return NextResponse.json({
      ok: true,
      ms: Date.now() - t0,
      tools: tools.map((t) => ({ name: t.name, description: (t.description || "").slice(0, 200) })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ulanib bo'lmadi" });
  } finally {
    await client?.close();
  }
}
