import { NextRequest, NextResponse } from "next/server";
import { sessionUserFromRequest } from "@/lib/session";
import { readState, withState } from "@/lib/stateStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_RE = /^(new|[A-Za-z0-9_-]{8,64})$/;

// Interfeys holati serverda: ochiq fayl (artifact), panel kengligi, sidebar, yozilayotgan matn (qoralama).
export async function GET(req: NextRequest) {
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const s = await readState(user);
  return NextResponse.json({ ui: s.ui }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest) {
  const user = await sessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  await withState(user, (s) => {
    if (typeof b.sidebarOpen === "boolean") s.ui.sidebarOpen = b.sidebarOpen;
    if (b.panelWidth === null) s.ui.panelWidth = null;
    else if (typeof b.panelWidth === "number" && b.panelWidth >= 200 && b.panelWidth <= 4000) s.ui.panelWidth = Math.round(b.panelWidth);
    if (b.openFile && typeof b.openFile === "object" && KEY_RE.test(String(b.openFile.chatId))) {
      const f = b.openFile.file;
      if (f && typeof f.path === "string" && typeof f.name === "string") {
        s.ui.openFiles[b.openFile.chatId] = {
          name: f.name.slice(0, 300),
          path: f.path.slice(0, 1000),
          size: typeof f.size === "number" ? f.size : undefined,
        };
      } else delete s.ui.openFiles[b.openFile.chatId];
    }
    if (b.draft && typeof b.draft === "object" && KEY_RE.test(String(b.draft.key))) {
      const t = typeof b.draft.text === "string" ? b.draft.text.slice(0, 20000) : "";
      if (t) s.ui.drafts[b.draft.key] = t;
      else delete s.ui.drafts[b.draft.key];
      const keys = Object.keys(s.ui.drafts);
      if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete s.ui.drafts[k];
    }
  });
  return NextResponse.json({ ok: true });
}
