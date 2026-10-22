// Agent loop: model <-> asboblar (kompyuter, fayl, scheduler, MCP connectorlar).
import { McpClient, McpConnector } from "@/lib/mcp";
import { buildBuiltinTools, makeServerCtx, ToolDef } from "@/lib/agentTools";
import { buildCodingTools } from "@/lib/codingTools";
import { getDefaultUrl, defaultModel } from "@/lib/providers";

export interface AgentInput {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  connectors?: McpConnector[];
  serverUrl?: string;
  appUrl?: string;
  keyId?: string;
  maxSteps?: number;
  scheduled?: boolean;
  signal?: AbortSignal;
  emit?: (text: string) => void;
}

interface Call { id: string; name: string; args: any; argError?: string }
interface StepResult { text: string; calls: Call[] }
interface Adapter {
  step(tools: ToolDef[]): Promise<StepResult>;
  addResults(results: Array<{ call: Call; output: string; isError: boolean }>): void;
}

const MAX_TOOLS = 120;
const SUPERSEDED_BUILTINS = new Set(["computer_exec", "computer_read_file", "computer_write_file", "computer_job_logs", "computer_job_kill"]);

function tzNow(): string {
  const tz = process.env.MRAI_TZ || "Asia/Tashkent";
  try {
    return `${new Date().toLocaleString("sv-SE", { timeZone: tz })} (${tz})`;
  } catch {
    return new Date().toISOString();
  }
}

function agentRules(scheduled: boolean): string {
  return [
    "AGENT REJIMI. Sizda haqiqiy asboblar (tools) bor — foydalanuvchi so'ragan ishni o'zingiz asboblar bilan bajaring; buyruqlarni foydalanuvchiga 'ishga tushiring' deb berib qo'ymang.",
    "Kod/fayl asboblari (Claude Code uslubida) — sandbox workspace ichida ishlaydi:",
    "- Bash: bash buyrug'i (git, npm/pip, build, test). Ishchi papka chaqiruvlar orasida saqlanadi. Fayl o'qish/qidirish/tahrirlash uchun Bash ishlatmang — maxsus asboblar bor. Dev server, watcher va uzoq jobs uchun run_in_background=true, so'ng BashOutput bilan kuzating, KillShell bilan to'xtating.",
    "- Read: fayl o'qish (qator raqamlari bilan; katta fayllar uchun offset/limit). Edit/Write dan OLDIN faylni Read qilish SHART.",
    "- Edit / MultiEdit: mavjud faylda aniq matnni almashtirish (old_string noyob bo'lishi kerak; bir fayldagi bir nechta o'zgarish uchun MultiEdit). Write: yangi fayl yoki to'liq qayta yozish; mavjud fayl uchun Edit afzal. So'ralmasa README/hujjat fayllarini yaratmang.",
    "- Glob (fayl nomi bo'yicha), Grep (ripgrep, ichidagi matn bo'yicha), LS (papka ro'yxati): qidirish uchun doim shularni ishlating, Bash dagi find/grep/cat/ls o'rniga.",
    "- TodoWrite: 3 va undan ko'p qadamli ishlarda avval reja tuzing, bittasi in_progress bo'lsin, bajarilgani zahoti completed qiling.",
    "- schedule_task / list_tasks / delete_task: jadval bo'yicha avtomatik vazifalar (local server 24/7 ishlaydi).",
    "- mcp_* nomli asboblar — foydalanuvchi ulagan connectorlar (MCP).",
    "Qoidalar: avval harakat qiling, so'ng natijani qisqa xulosa qiling. Xato chiqsa sabablarini tahlil qilib o'zingiz tuzating va qayta urining. Sandbox cheklovlari: /usr faqat o'qish uchun (apt ishlamaydi), pip/npm paketlarini workspace ichiga o'rnating. Xavfli/qaytarib bo'lmas amallardan (o'chirish, ustidan yozish) oldin foydalanuvchi aniq so'ragan bo'lishi kerak.",
    `Hozirgi vaqt: ${tzNow()}. Jadval vaqtlari server mahalliy vaqtida beriladi.`,
    scheduled
      ? "Siz jadval bo'yicha avtomatik ishga tushirilgansiz: foydalanuvchi hozir yo'q — savol bermang, vazifani oxirigacha bajaring va oxirida qisqa hisobot yozing."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function cleanSchema(s: any): any {
  if (!s || typeof s !== "object") return { type: "object", properties: {} };
  const walk = (n: any): any => {
    if (Array.isArray(n)) return n.map(walk);
    if (n && typeof n === "object") {
      const o: any = {};
      for (const [k, v] of Object.entries(n)) {
        if (k === "$schema" || k === "additionalProperties" || k === "$id") continue;
        o[k] = walk(v);
      }
      return o;
    }
    return n;
  };
  const out = walk(s);
  if (!out.type) out.type = "object";
  if (out.type === "object" && !out.properties) out.properties = {};
  return out;
}

function parseArgs(raw: any): { args: any; err?: string } {
  if (raw && typeof raw === "object") return { args: raw };
  if (!raw || !String(raw).trim()) return { args: {} };
  try {
    return { args: JSON.parse(String(raw)) };
  } catch {
    return { args: {}, err: "Asbob argumentlari yaroqsiz JSON edi. To'g'ri JSON bilan qayta chaqiring." };
  }
}

async function readError(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t);
    return j?.error?.message || j?.message || (typeof j?.error === "string" ? j.error : "") || t.slice(0, 300);
  } catch {
    return t.slice(0, 300);
  }
}

// ---------------------------------------------------------------- OpenAI-mos
function openaiAdapter(inp: AgentInput, system: string): Adapter & { disableTools(): void } {
  const base = (inp.baseUrl?.trim() ? inp.baseUrl.trim() : getDefaultUrl(inp.provider)).replace(/\/+$/, "");
  const endpoint = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  const model = defaultModel(inp.provider, inp.model);
  const msgs: any[] = [{ role: "system", content: system }];
  for (const m of inp.messages) msgs.push({ role: m.role, content: m.content });
  let toolsOff = false;
  return {
    disableTools() {
      toolsOff = true;
    },
    async step(tools) {
      const body: any = {
        model,
        messages: msgs,
        temperature: Math.min(Math.max(0, inp.temperature ?? 0.7), 2),
        max_tokens: Math.min(Math.max(1, inp.maxTokens ?? 4096), 16384),
      };
      if (tools.length && !toolsOff) {
        body.tools = tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description.slice(0, 300), parameters: cleanSchema(t.parameters) },
        }));
        body.tool_choice = "auto";
      }
      const headers: Record<string, string> = { Authorization: `Bearer ${inp.apiKey.trim()}`, "Content-Type": "application/json" };
      if (inp.provider === "openrouter") {
        headers["HTTP-Referer"] = "https://mrai-uzbek.vercel.app";
        headers["X-Title"] = "MR AI Pro";
      }
      const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: inp.signal });
      if (!res.ok) {
        const err = await readError(res);
        const e: any = new Error(`${inp.provider} HTTP ${res.status}: ${err}`);
        e.status = res.status;
        e.toolRelated = /tool|function/i.test(err);
        throw e;
      }
      const j = await res.json();
      const m = j?.choices?.[0]?.message || {};
      msgs.push({ role: "assistant", content: m.content ?? null, ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) });
      const calls: Call[] = (m.tool_calls || []).map((tc: any, i: number) => {
        const p = parseArgs(tc.function?.arguments);
        return { id: tc.id || `call_${i}`, name: tc.function?.name, args: p.args, argError: p.err };
      });
      return { text: typeof m.content === "string" ? m.content : "", calls };
    },
    addResults(results) {
      for (const r of results) msgs.push({ role: "tool", tool_call_id: r.call.id, content: r.output });
    },
  };
}

// ---------------------------------------------------------------- Anthropic
function anthropicAdapter(inp: AgentInput, system: string): Adapter {
  const model = defaultModel("anthropic", inp.model);
  const msgs: any[] = inp.messages.map((m) => ({ role: m.role, content: m.content }));
  return {
    async step(tools) {
      const body: any = {
        model,
        system,
        messages: msgs,
        temperature: Math.min(Math.max(0, inp.temperature ?? 0.7), 1),
        max_tokens: Math.min(Math.max(1, inp.maxTokens ?? 4096), 16384),
      };
      if (tools.length) {
        body.tools = tools.map((t) => ({ name: t.name, description: t.description.slice(0, 300), input_schema: cleanSchema(t.parameters) }));
      }
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": inp.apiKey.trim(), "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: inp.signal,
      });
      if (!res.ok) throw new Error(`anthropic HTTP ${res.status}: ${await readError(res)}`);
      const j = await res.json();
      const content: any[] = j.content || [];
      msgs.push({ role: "assistant", content });
      const text = content.filter((c) => c.type === "text").map((c) => c.text).join("");
      const calls: Call[] = content.filter((c) => c.type === "tool_use").map((c) => ({ id: c.id, name: c.name, args: c.input || {} }));
      return { text, calls };
    },
    addResults(results) {
      msgs.push({
        role: "user",
        content: results.map((r) => ({ type: "tool_result", tool_use_id: r.call.id, content: r.output, is_error: r.isError })),
      });
    },
  };
}

// ---------------------------------------------------------------- MCP -> ToolDef
async function loadMcpTools(
  connectors: McpConnector[],
  clients: McpClient[],
  notes: string[]
): Promise<ToolDef[]> {
  const list = connectors.filter((c) => c && c.url && c.enabled !== false);
  const settled = await Promise.allSettled(
    list.map(async (c, i) => {
      const client = new McpClient(c, 60000);
      clients.push(client);
      await Promise.race([
        client.connect(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("ulanish vaqti tugadi (20s)")), 20000)),
      ]);
      const tools = await client.listTools();
      return { c, i, client, tools };
    })
  );
  const out: ToolDef[] = [];
  settled.forEach((r, idx) => {
    if (r.status === "rejected") {
      notes.push(`Connector "${list[idx].name}" ulanmadi: ${r.reason?.message || r.reason}`);
      return;
    }
    const { c, i, client, tools } = r.value;
    for (const t of tools) {
      const safe = t.name.replace(/[^a-zA-Z0-9_-]/g, "_");
      const name = `mcp_${i + 1}_${safe}`.slice(0, 64);
      out.push({
        name,
        label: `${c.name}: ${t.name}`,
        description: `[${c.name}] ${t.description || t.name}`,
        parameters: t.inputSchema || { type: "object", properties: {} },
        run: async (args) => {
          const res = await client.callTool(t.name, args);
          const txt = String(res.text ?? "");
          const LIM = 5000;
          return { output: txt.length > LIM ? txt.slice(0, LIM) + `\n…[${txt.length - LIM} belgi qisqartirildi]` : txt, isError: res.isError };
        },
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------- display helpers
function brief(call: Call): string {
  if (call.name === "Bash" || call.name === "computer_exec") return String(call.args?.command ?? "").slice(0, 600);
  if (call.name === "Write") return `${call.args?.file_path} (${String(call.args?.content ?? "").length} belgi)`;
  if (call.name === "Edit") return `${call.args?.file_path} (${String(call.args?.old_string ?? "").length} → ${String(call.args?.new_string ?? "").length} belgi)`;
  if (call.name === "MultiEdit") return `${call.args?.file_path} (${Array.isArray(call.args?.edits) ? call.args.edits.length : 0} ta o'zgarish)`;
  if (call.name === "computer_write_file") return `${call.args?.path} (${String(call.args?.content ?? "").length} belgi)`;
  const s = JSON.stringify(call.args ?? {});
  return s.length > 300 ? s.slice(0, 300) + "…" : s;
}

function fence(text: string): string {
  const body = text.length > 1800 ? text.slice(0, 1200) + "\n…\n" + text.slice(-500) : text;
  return "\n````text\n" + body.replace(/\s+$/, "") + "\n````\n\n";
}

// ---------------------------------------------------------------- main loop
export async function runAgent(inp: AgentInput): Promise<{ final: string; transcript: string; steps: number }> {
  const emit = inp.emit || (() => {});
  let transcript = "";
  const out = (s: string) => {
    transcript += s;
    emit(s);
  };
  const clients: McpClient[] = [];
  try {
    const notes: string[] = [];
    const env = { serverUrl: inp.serverUrl, appUrl: inp.appUrl, keyId: inp.keyId, signal: inp.signal, allowScheduling: !inp.scheduled };
    // Coding asboblari computer_exec/read/write/job_* ni to'liq almashtiradi — takroriy asboblar modelni chalg'itadi
    const builtin = buildBuiltinTools(env).filter((t) => !SUPERSEDED_BUILTINS.has(t.name));
    const coding = buildCodingTools(makeServerCtx(env));
    const mcp = inp.connectors?.length ? await loadMcpTools(inp.connectors, clients, notes) : [];
    let tools: ToolDef[] = [];
    const seen = new Set<string>();
    for (const t of [...coding, ...builtin, ...mcp]) {
      if (seen.has(t.name)) {
        notes.push(`Asbob nomi takrorlandi, o'tkazib yuborildi: ${t.name}`);
        continue;
      }
      seen.add(t.name);
      tools.push(t);
    }
    if (tools.length > MAX_TOOLS) {
      notes.push(`Asboblar juda ko'p (${tools.length}); birinchi ${MAX_TOOLS} tasi ishlatiladi.`);
      tools = tools.slice(0, MAX_TOOLS);
    }
    for (const n of notes) out(`> ${n}\n\n`);
    const byName = new Map(tools.map((t) => [t.name, t]));

    const system = [agentRules(!!inp.scheduled), inp.system || ""].filter(Boolean).join("\n\n");
    const adapter = inp.provider === "anthropic" ? anthropicAdapter(inp, system) : openaiAdapter(inp, system);
    const maxSteps = Math.min(Math.max(1, inp.maxSteps ?? 100), 1000);
    let final = "";
    let steps = 0;

    for (; steps < maxSteps; steps++) {
      if (inp.signal?.aborted) break;
      let res: StepResult;
      try {
        res = await adapter.step(tools);
      } catch (e: any) {
        if (steps === 0 && e?.toolRelated && "disableTools" in adapter) {
          (adapter as any).disableTools();
          tools = [];
          out("> Bu model tool-calling'ni qo'llamaydi — oddiy chat rejimida javob beraman. Asboblar uchun tool-calling qo'llaydigan modelni tanlang.\n\n");
          res = await adapter.step(tools);
        } else {
          throw e;
        }
      }
      if (res.text.trim()) {
        out(res.text.replace(/\s+$/, "") + "\n\n");
        final = res.text;
      }
      if (!res.calls.length) break;

      const results: Array<{ call: Call; output: string; isError: boolean }> = [];
      for (const call of res.calls) {
        const tool = byName.get(call.name);
        out(`\n> **Asbob:** \`${tool?.label || call.name}\`\n\n`);
        let r: { output: string; isError?: boolean };
        const t0 = Date.now();
        if (call.argError) r = { output: call.argError, isError: true };
        else if (!tool) r = { output: `Noma'lum asbob: ${call.name}`, isError: true };
        else {
          try {
            r = await tool.run(call.args);
          } catch (e: any) {
            r = { output: `Asbob xatosi: ${e?.message || e}`, isError: true };
          }
        }
        const shown = (call.name === "computer_exec" || call.name === "Bash" ? `$ ${brief(call)}\n` : `${brief(call)}\n`) + `→ ${r.isError ? "XATO" : "ok"} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${r.output}`;
        out(fence(shown));
        results.push({ call, output: r.output, isError: !!r.isError });
      }
      adapter.addResults(results);
    }
    if (steps >= maxSteps) out(`> Qadamlar chegarasiga yetdi (${maxSteps}). Davom ettirish uchun "davom et" deb yozing.\n\n`);
    return { final, transcript, steps };
  } finally {
    await Promise.allSettled(clients.map((c) => c.close()));
  }
}
