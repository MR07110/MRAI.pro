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

function fileSeg(path: string, size = 0): FileSeg | null {
  const p = path.trim();
  if (!p.startsWith("/")) return null;
  return { type: "file", path: p, name: p.split("/").pop() || p, size: size || 0 };
}

function parseFiles(output: string): FileSeg[] {
  const res: FileSeg[] = [];
  const seen = new Set<string>();
  for (const line of output.split("\n")) {
    if (!line.startsWith("@file\t")) continue;
    const [, size, ...rest] = line.split("\t");
    const path = rest.join("\t");
    const f = fileSeg(path, Number(size) || 0);
    if (f && !seen.has(f.path)) {
      seen.add(f.path);
      res.push(f);
    }
  }
  return res;
}

/** Model ba'zan present_files ni tool o'rniga matn qilib yozadi — shuni kartochkaga aylantiramiz. */
const FAKE_PRESENT_RE =
  /(?:<\|)?\s*present_files\s*\|?\s*(?:\(\s*)?(\{[\s\S]*?\})\s*(?:\)\s*)?(?:\|>|>)?/gi;
const AT_FILE_LINE_RE = /^@file\t(\d+)\t(\/[^\n]+)$/gm;

function extractInlineFiles(text: string): { clean: string; files: FileSeg[] } {
  const files: FileSeg[] = [];
  const seen = new Set<string>();
  let clean = text;

  // 1) @file\tsize\t/path qatorlari (markdown ichida)
  clean = clean.replace(AT_FILE_LINE_RE, (_m, size, path) => {
    const f = fileSeg(path, Number(size) || 0);
    if (f && !seen.has(f.path)) {
      seen.add(f.path);
      files.push(f);
    }
    return "";
  });

  // 2) <|present_files|{"paths":[...]}> yoki present_files({...})
  clean = clean.replace(FAKE_PRESENT_RE, (_m, jsonStr: string) => {
    try {
      const j = JSON.parse(jsonStr);
      const raw = Array.isArray(j.paths) ? j.paths : j.path ? [j.path] : [];
      for (const p of raw) {
        const f = fileSeg(String(p || ""));
        if (f && !seen.has(f.path)) {
          seen.add(f.path);
          files.push(f);
        }
      }
    } catch {
      /* ignore bad json */
    }
    return "";
  });

  // leftover <|  |>  |>
  clean = clean.replace(/^[ \t]*[<|/>]{1,6}[ \t]*$/gm, "");
  // model yozgan "Yuklab olish: quyidagi karta..." — kartochka bor, kerak emas
  if (files.length) {
    clean = clean.replace(/^[ \t]*[📦🗂]?[ \t]*Yuklab olish:[^\n]*$/gmi, "");
  }

  // 3) ` /abs/path/file.ext ` yoki ( /abs/path ) — faqat aniq fayl yo'li ko'rinishida
  // juda agressiv bo'lmasin: faqat present_files / yuklab kontekstida emas, umumiy yo'llarni qoldiramiz

  clean = clean.replace(/\n{3,}/g, "\n\n").trim();
  return { clean, files };
}

function isFileTool(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "fayl berish" || n === "present_files" || n === "present files";
}

// Javob matnini: oddiy markdown / asbob qadamlari / kutish sanagichi / fayl kartochkalari
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
      if (i > last) {
        const { clean, files } = extractInlineFiles(text.slice(last, i));
        if (clean.trim()) out.push({ type: "md", text: clean });
        out.push(...files);
      }
      if (m[2] === undefined) {
        out.push({ type: "tool", name: m[1], head: "", status: live ? "running" : "stopped", output: "" });
      } else {
        const f = parseFence(m[2]);
        // present_files / Fayl berish: muvaffaqiyatli bo'lsa asbob qadami o'rniga kartochkalar
        const fromTool = isFileTool(m[1]) && f.status === "ok" ? parseFiles(f.output) : [];
        if (fromTool.length) out.push(...fromTool);
        else out.push({ type: "tool", name: m[1], head: f.head, status: f.status, secs: f.secs, output: f.output });
      }
      last = i + m[0].length;
    }
    if (last < text.length) {
      const { clean, files } = extractInlineFiles(text.slice(last));
      if (clean.trim()) out.push({ type: "md", text: clean });
      out.push(...files);
    }
  }
  return out;
}
