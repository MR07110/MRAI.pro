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

function parseFenceBody(body: string, live: boolean) {
  let b = body.replace(/^\s*````text\n?/, "").replace(/\n?````\s*$/, "");
  const lines = b.split("\n");
  const i = lines.findIndex((l) => /^→ (ok|XATO) \(/.test(l));
  if (i < 0) {
    return {
      head: b.trim(),
      status: (live ? "running" : "stopped") as "running" | "stopped",
      secs: undefined as string | undefined,
      output: "",
    };
  }
  const m = lines[i].match(/^→ (ok|XATO) \(([\d.]+)s\)/);
  return {
    head: lines.slice(0, i).join("\n").trim(),
    status: (m?.[1] === "XATO" ? "error" : "ok") as "ok" | "error",
    secs: m?.[2],
    output: lines.slice(i + 1).join("\n").trim(),
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

/** Markdown dan asbob sintaksisini olib tashlash (blockquote / *Asbob:* qoldiqlar). */
function scrubToolLeak(md: string): string {
  let s = md;
  s = s.replace(/(?:^|\n)[ \t]*>[^\n]*Asbob[^\n]*/gi, "\n");
  s = s.replace(/(?:^|\n)[ \t]*\*{1,2}Asbob:?\*{0,2}[^\n]*/gi, "\n");
  s = s.replace(/(?:^|\n)````text\n[\s\S]*?(?:\n````|$)/g, "\n");
  s = s.replace(/(?:^|\n)````text\n[\s\S]*$/g, "\n");
  s = s.replace(/(?:^|\n)````[\s\S]*$/g, "\n");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function extractTools(text: string, live: boolean): Seg[] {
  const segs: Seg[] = [];
  const startRe = /(?:^|\n)([ \t]*>[ \t]*\*\*Asbob:\*\*[ \t]*`([^`\n]+)`[^\n]*)/g;
  const matches: { index: number; endLine: number; name: string }[] = [];
  for (const m of text.matchAll(startRe)) {
    const index = m.index ?? 0;
    matches.push({ index, endLine: index + m[0].length, name: m[2] });
  }

  if (matches.length === 0) {
    if (live) {
      const partial = text.search(/(?:^|\n)[ \t]*>[ \t]*\*?\*?Asbob/i);
      if (partial >= 0) {
        const before = scrubToolLeak(text.slice(0, partial));
        if (before) segs.push({ type: "md", text: before });
        const after = text.slice(partial);
        const nameM = after.match(/`([^`\n]+)`/);
        segs.push({
          type: "tool",
          name: nameM?.[1] || "Asbob",
          head: "",
          status: "running",
          output: "",
        });
        return segs;
      }
    }
    const clean = scrubToolLeak(text);
    if (clean) segs.push({ type: "md", text: clean });
    return segs;
  }

  let cursor = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.index > cursor) {
      const md = scrubToolLeak(text.slice(cursor, m.index));
      if (md) segs.push({ type: "md", text: md });
    }
    const bodyStart = m.endLine;
    const nextStart = i + 1 < matches.length ? matches[i + 1].index : text.length;
    let body = text.slice(bodyStart, nextStart);
    let blockEnd = nextStart;
    if (body.includes("````text")) {
      const close = body.search(/\n````(?:\s*\n|$)/);
      if (close >= 0) {
        blockEnd = bodyStart + close + 5;
        while (blockEnd < text.length && /[\n\r]/.test(text[blockEnd]!)) blockEnd++;
        body = text.slice(bodyStart, blockEnd);
      } else {
        body = text.slice(bodyStart, nextStart);
        blockEnd = nextStart;
      }
    } else {
      body = "";
      blockEnd = bodyStart;
      while (blockEnd < nextStart && /[\n\r\s]/.test(text[blockEnd]!)) blockEnd++;
    }

    const f = parseFenceBody(body, live);
    const files = m.name === "Fayl berish" && f.status === "ok" ? parseFiles(f.output) : [];
    if (files.length) segs.push(...files);
    else {
      segs.push({
        type: "tool",
        name: m.name,
        head: f.head,
        status: f.status,
        secs: f.secs,
        output: f.output,
      });
    }
    cursor = Math.max(blockEnd, m.endLine);
    while (cursor < text.length && /[\n\r]/.test(text[cursor]!)) cursor++;
  }
  if (cursor < text.length) {
    const md = scrubToolLeak(text.slice(cursor));
    if (md) segs.push({ type: "md", text: md });
  }
  return segs;
}

export function splitAgent(content: string, live: boolean): Seg[] {
  const out: Seg[] = [];
  for (const seg of splitWait(content)) {
    if (seg.type === "wait") {
      out.push({ type: "wait", end: seg.end });
      continue;
    }
    out.push(...extractTools(seg.text, live));
  }
  return out.filter((s) => s.type !== "md" || s.text.trim().length > 0);
}
