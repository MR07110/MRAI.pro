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
export type FileSeg = { type: "file"; path: string; name: string; size: number };
export type Seg = MdSeg | ToolSeg | WaitSeg | FileSeg;

// agent.ts:  > **Asbob:** `Nom`\n\n  +  ````text\n...\n````\n\n
const TOOL_START_RE = /(?:^|\n)> \*\*Asbob:\*\* `([^`\n]*)`/g;

function parseFence(body: string, live: boolean) {
  const lines = body.split("\n");
  const i = lines.findIndex((l) => /^→ (ok|XATO) \(/.test(l));
  if (i < 0) {
    // fence yopilmagan yoki natija hali yo'q — stream paytida running
    return {
      head: body.replace(/^````text\n?/, "").replace(/\n?````\s*$/, ""),
      status: (live ? "running" : "stopped") as "running" | "stopped",
      secs: undefined as string | undefined,
      output: "",
    };
  }
  const m = lines[i].match(/^→ (ok|XATO) \(([\d.]+)s\)/);
  return {
    head: lines.slice(0, i).join("\n"),
    status: (m?.[1] === "XATO" ? "error" : "ok") as "ok" | "error",
    secs: m?.[2],
    output: lines.slice(i + 1).join("\n"),
  };
}

function parseFiles(output: string): FileSeg[] {
  const res: FileSeg[] = [];
  for (const line of output.split("\n")) {
    if (!line.startsWith("@file\t")) continue;
    const [, size, ...rest] = line.split("\t");
    const path = rest.join("\t");
    if (!path.startsWith("/")) continue;
    res.push({ type: "file", path, name: path.split("/").pop() || path, size: Number(size) || 0 });
  }
  return res;
}

/** Bitta asbob blokining oxirini topadi (keyingi Asbob yoki matn). */
function toolBlockEnd(text: string, from: number): number {
  const rest = text.slice(from);
  // Yopiq fence bor-mi?
  const fenceOpen = rest.match(/^\n*(````text\n)/);
  if (fenceOpen) {
    const afterOpen = from + (fenceOpen.index ?? 0) + fenceOpen[0].length;
    const close = text.indexOf("\n````", afterOpen);
    if (close >= 0) return close + "\n````".length;
    // ochiq fence — stream oxirigacha
    return text.length;
  }
  // fence hali yo'q: keyingi asbobgacha yoki bo'sh qatorlar+matn
  const next = text.slice(from + 1).search(/\n> \*\*Asbob:\*\* `/);
  if (next >= 0) return from + 1 + next;
  return text.length;
}

// Javob matnini: markdown / asbob / kutish. live=true da yarim tayyor asbob code-box bo'lib chiqmaydi.
export function splitAgent(content: string, live: boolean): Seg[] {
  const out: Seg[] = [];
  for (const seg of splitWait(content)) {
    if (seg.type === "wait") {
      out.push({ type: "wait", end: seg.end });
      continue;
    }
    const text = seg.text;
    let last = 0;
    TOOL_START_RE.lastIndex = 0;
    const starts: { index: number; name: string; full: string }[] = [];
    for (const m of text.matchAll(TOOL_START_RE)) {
      starts.push({ index: m.index ?? 0, name: m[1], full: m[0] });
    }
    for (let s = 0; s < starts.length; s++) {
      const st = starts[s];
      const nameStart = st.index;
      // match ba'zan \n bilan boshlanadi — md uchun last ni to'g'rilash
      const mdEnd = nameStart;
      if (mdEnd > last) {
        const md = text.slice(last, mdEnd);
        if (md.trim()) out.push({ type: "md", text: md });
      }
      const bodyStart = nameStart + st.full.length;
      const bodyEnd = toolBlockEnd(text, bodyStart);
      let body = text.slice(bodyStart, bodyEnd);
      // ````text ... ```` ni olib tashlash
      const fm = body.match(/^\s*````text\n([\s\S]*?)(?:\n````\s*)?$/);
      if (fm) body = fm[1];
      else body = body.replace(/^\s*````text\n?/, "").replace(/\n?````\s*$/, "");

      const f = parseFence(body, live);
      const files = st.name === "Fayl berish" && f.status === "ok" ? parseFiles(f.output) : [];
      if (files.length) out.push(...files);
      else
        out.push({
          type: "tool",
          name: st.name,
          head: f.head,
          status: f.status,
          secs: f.secs,
          output: f.output,
        });
      last = bodyEnd;
      // fence dan keyin \n\n
      while (last < text.length && (text[last] === "\n" || text[last] === "\r")) last++;
    }
    if (last < text.length) {
      const md = text.slice(last);
      // Stream oxiridagi ochiq ``` / yarim asbob sintaksisini yashirish
      if (live && /(?:^|\n)> \*\*Asbob:\*\*/.test(md)) {
        // allaqachon qayta ishlangan bo'lishi kerak; qolganini faqat toza md qoldirish
        const cut = md.search(/(?:^|\n)> \*\*Asbob:\*\*/);
        const clean = cut >= 0 ? md.slice(0, cut) : md;
        if (clean.trim()) out.push({ type: "md", text: clean });
      } else if (live && /```/.test(md) && (md.match(/```/g) || []).length % 2 === 1) {
        // yopilmagan code fence — ko'rsatmaslik (asbob natijasi)
        const cut = md.lastIndexOf("```");
        const clean = cut >= 0 ? md.slice(0, cut) : "";
        if (clean.trim()) out.push({ type: "md", text: clean });
      } else if (md.trim()) {
        out.push({ type: "md", text: md });
      }
    }
  }
  return out;
}
