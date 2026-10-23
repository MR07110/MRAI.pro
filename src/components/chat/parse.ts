import { splitWait } from "../WaitCountdown";

// <think>...</think> ni javobdan ajratadi
export function parseThinkingAndContent(raw: string) {
  if (raw.startsWith("<think>")) {
    const m = raw.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
    if (m) {
      return { thinking: m[1].trim(), content: raw.replace(/<think>[\s\S]*?(?:<\/think>|$)/, "").trim() };
    }
  }
  if (raw.startsWith("<") && "<think>".startsWith(raw)) {
    return { thinking: "", content: "" };
  }
  const m = raw.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
  if (m) {
    return { thinking: m[1].trim(), content: raw.replace(/<think>[\s\S]*?(?:<\/think>|$)/, "").trim() };
  }
  return { thinking: null as string | null, content: raw };
}

export type ToolSeg = {
  type: "tool";
  name: string;
  head: string;
  status: "running" | "ok" | "error" | "stopped";
  secs?: string;
  output: string;
};
export type MdSeg = { type: "md"; text: string };
export type WaitSeg = { type: "wait"; end: number };
export type Seg = MdSeg | ToolSeg | WaitSeg;

// agent.ts quyidagi formatni chiqaradi:
//   > **Asbob:** `Nom`\n\n   +   ````text\n<buyruq>\n→ ok (1.2s)\n<natija>\n````\n\n
const TOOL_RE = /(?:^|\n)> \*\*Asbob:\*\* `([^`\n]*)`\n+(?:````text\n([\s\S]*?)\n````)?/g;

function parseFence(body: string) {
  const lines = body.split("\n");
  const i = lines.findIndex((l) => /^→ (ok|XATO) \(/.test(l));
  if (i < 0) return { head: body, status: "ok" as const, secs: undefined as string | undefined, output: "" };
  const m = lines[i].match(/^→ (ok|XATO) \(([\d.]+)s\)/);
  return {
    head: lines.slice(0, i).join("\n"),
    status: (m?.[1] === "XATO" ? "error" : "ok") as "ok" | "error",
    secs: m?.[2],
    output: lines.slice(i + 1).join("\n"),
  };
}

// Javob matnini: oddiy markdown / asbob qadamlari / kutish sanagichi bo'laklariga ajratadi.
// live=true bo'lsa natijasi hali kelmagan asbob "running", aks holda "stopped" bo'ladi.
export function splitAgent(content: string, live: boolean): Seg[] {
  const out: Seg[] = [];
  for (const seg of splitWait(content)) {
    if (seg.type === "wait") {
      out.push({ type: "wait", end: seg.end });
      continue;
    }
    let last = 0;
    const text = seg.text;
    for (const m of text.matchAll(TOOL_RE)) {
      const i = m.index ?? 0;
      if (i > last) out.push({ type: "md", text: text.slice(last, i) });
      if (m[2] === undefined) {
        out.push({ type: "tool", name: m[1], head: "", status: live ? "running" : "stopped", output: "" });
      } else {
        const f = parseFence(m[2]);
        out.push({ type: "tool", name: m[1], head: f.head, status: f.status, secs: f.secs, output: f.output });
      }
      last = i + m[0].length;
    }
    if (last < text.length) out.push({ type: "md", text: text.slice(last) });
  }
  return out;
}
