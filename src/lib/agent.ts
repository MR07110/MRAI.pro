// Agent loop: model <-> tools (computer, files, scheduler, MCP connectors).
import { applyPromptVars } from "@/lib/promptVars";
import { addMemory, getMemory } from "@/lib/stateStore";
import { withSkillsCatalog, getSkillsAsync } from "@/lib/skills";
import { buildSkillTools, findSkill, loadSkillText } from "@/lib/skillTools";
import { McpClient, McpConnector } from "@/lib/mcp";
import { buildBuiltinTools, makeServerCtx, ToolDef } from "@/lib/agentTools";
import { buildCodingTools } from "@/lib/codingTools";
import { getDefaultUrl, defaultModel } from "@/lib/providers";
import { recordUsage, estTok } from "@/lib/usage";

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
  chatId?: string;
  user?: string;
  maxSteps?: number;
  scheduled?: boolean;
  signal?: AbortSignal;
  emit?: (text: string) => void;
  /** called when a 429 forces a wait (in seconds) */
  onWait?: (seconds: number) => void;
}

interface Call { id: string; name: string; args: any; argError?: string }
interface StepResult { text: string; calls: Call[]; usage?: { input: number; output: number; estimated?: boolean } }
interface Adapter {
  step(tools: ToolDef[]): Promise<StepResult>;
  addResults(results: Array<{ call: Call; output: string; isError: boolean }>): void;
  /** remove the last (empty) assistant turn so the step can be retried */
  dropEmpty?(): void;
}

const MAX_TOOLS = 120;
const SUPERSEDED_BUILTINS = new Set(["computer_exec", "computer_read_file", "computer_write_file", "computer_job_logs", "computer_job_kill"]);

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
    return { args: {}, err: "Tool arguments were invalid JSON. Retry with valid JSON." };
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
  const msgs: any[] = system ? [{ role: "system", content: system }] : [];
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
      let res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: inp.signal });
      // 429 (TPM/RPM limit, e.g. the Groq free tier): follow the "try again in Ns" hint, wait briefly and retry
      for (let attempt = 0; res.status === 429 && attempt < 4; attempt++) {
        const wait = retryAfterMs(res.headers.get("retry-after"), await res.clone().text().catch(() => ""));
        if (wait === null || wait > 65000) break; // long wait (daily limit, etc.) — return the error as-is
        inp.onWait?.(Math.ceil((wait + 500) / 1000));
        await sleepAbortable(wait + 500, inp.signal);
        res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: inp.signal });
      }
      if (!res.ok) {
        const err = await readError(res);
        // Retry once on 500 for ollama (often temporary model overload)
        if (res.status === 500 && inp.provider === "ollama") {
          await sleepAbortable(1500, inp.signal);
          res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: inp.signal });
          if (res.ok) {
            // continue normally below
          } else {
            const err2 = await readError(res);
            const e: any = new Error(`${inp.provider} HTTP ${res.status}: ${err2}. Model may be overloaded — try a smaller one (gpt-oss:20b, gemma4:31b).`);
            e.status = res.status;
            e.toolRelated = /tool|function/i.test(err2);
            throw e;
          }
        } else {
          const e: any = new Error(`${inp.provider} HTTP ${res.status}: ${err}`);
          e.status = res.status;
          e.toolRelated = /tool|function/i.test(err);
          throw e;
        }
      }
      const j = await res.json();
      const m = j?.choices?.[0]?.message || {};
      const reqChars = JSON.stringify(msgs).length + (body.tools ? JSON.stringify(body.tools).length : 0);
      const uu = j?.usage;
      const usage: StepResult["usage"] =
        uu && (uu.prompt_tokens || uu.completion_tokens)
          ? { input: Number(uu.prompt_tokens) || 0, output: Number(uu.completion_tokens) || 0 }
          : { input: estTok(reqChars), output: estTok((typeof m.content === "string" ? m.content.length : 0) + JSON.stringify(m.tool_calls || []).length), estimated: true };
      msgs.push({ role: "assistant", content: m.content ?? null, ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) });
      const calls: Call[] = (m.tool_calls || []).map((tc: any, i: number) => {
        const p = parseArgs(tc.function?.arguments);
        return { id: tc.id || `call_${i}`, name: tc.function?.name, args: p.args, argError: p.err };
      });
      return { text: typeof m.content === "string" ? m.content : "", calls, usage };
    },
    addResults(results) {
      for (const r of results) msgs.push({ role: "tool", tool_call_id: r.call.id, content: r.output });
    },
    dropEmpty() {
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant" && !last.tool_calls) msgs.pop();
    },
  };
}

function retryAfterMs(header: string | null, text: string): number | null {
  const m = text.match(/try again in\s+(?:(\d+)h)?\s*(?:(\d+)m(?!s))?\s*([0-9.]+)?\s*(ms|s)?/i);
  if (m && (m[1] || m[2] || m[3])) {
    const unit = (m[4] || "s").toLowerCase() === "ms" ? 1 : 1000;
    return Number(m[1] || 0) * 3600000 + Number(m[2] || 0) * 60000 + Number(m[3] || 0) * unit;
  }
  const ra = Number(header);
  return Number.isFinite(ra) && ra > 0 ? ra * 1000 : null;
}

function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

// ---------------------------------------------------------------- Anthropic
// Return a copy of the messages with a single cache breakpoint on the last message's last content block.
// The original list is left untouched (no accumulation, no effect on token estimates).
function withMsgCache(msgs: any[]): any[] {
  if (!msgs.length) return msgs;
  const out = msgs.map((m) => ({ ...m }));
  const last = out[out.length - 1];
  let content: any[] = typeof last.content === "string" ? [{ type: "text", text: last.content }] : last.content.map((b: any) => ({ ...b }));
  if (content.length) content[content.length - 1] = { ...content[content.length - 1], cache_control: { type: "ephemeral" } };
  last.content = content;
  return out;
}

function anthropicAdapter(inp: AgentInput, system: string): Adapter {
  const model = defaultModel("anthropic", inp.model);
  const msgs: any[] = inp.messages.map((m) => ({ role: m.role, content: m.content }));
  return {
    async step(tools) {
      const body: any = {
        model,
        // Cache the system prompt (base + skills catalog): read back at ~10% cost on every step and turn.
        ...(system ? { system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] } : {}),
        // Also cache the conversation so far: a breakpoint on the last message means each new step only pays
        // full price for the newest turn; the whole prefix (tools + system + earlier messages) reads back cheap.
        messages: withMsgCache(msgs),
        temperature: Math.min(Math.max(0, inp.temperature ?? 0.7), 1),
        max_tokens: Math.min(Math.max(1, inp.maxTokens ?? 4096), 16384),
      };
      if (tools.length) {
        body.tools = tools.map((t) => ({ name: t.name, description: t.description.slice(0, 1500), input_schema: cleanSchema(t.parameters) }));
        // Cache the whole tool set (large, constant): a breakpoint on the last tool caches all tools before it.
        const lastTool = body.tools[body.tools.length - 1];
        if (lastTool) lastTool.cache_control = { type: "ephemeral" };
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
      const au = j.usage;
      const usage: StepResult["usage"] =
        au && (au.input_tokens || au.output_tokens)
          ? {
              input: (Number(au.input_tokens) || 0) + (Number(au.cache_creation_input_tokens) || 0) + (Number(au.cache_read_input_tokens) || 0),
              output: Number(au.output_tokens) || 0,
            }
          : { input: estTok(JSON.stringify(msgs).length + system.length), output: estTok(JSON.stringify(content).length), estimated: true };
      msgs.push({ role: "assistant", content });
      const text = content.filter((c) => c.type === "text").map((c) => c.text).join("");
      const calls: Call[] = content.filter((c) => c.type === "tool_use").map((c) => ({ id: c.id, name: c.name, args: c.input || {} }));
      return { text, calls, usage };
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
      const client = new McpClient(c, 15000);
      clients.push(client);
      // Fast fail: a down connector must not stall the first reply (keeps the app realtime, e.g. a plain "hello").
      await Promise.race([
        client.connect(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("connection timed out (5s)")), 5000)),
      ]);
      const tools = await client.listTools();
      return { c, i, client, tools };
    })
  );
  const out: ToolDef[] = [];
  settled.forEach((r, idx) => {
    if (r.status === "rejected") {
      notes.push(`Connector "${list[idx].name}" could not connect: ${r.reason?.message || r.reason}`);
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
          const LIM = 2500;
          return { output: txt.length > LIM ? txt.slice(0, LIM) + `\n…[${txt.length - LIM} chars truncated]` : txt, isError: res.isError };
        },
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------- display helpers
function brief(call: Call): string {
  if (call.name === "Bash" || call.name === "computer_exec") return String(call.args?.command ?? "").slice(0, 600);
  if (call.name === "Write") return `${call.args?.file_path} (${String(call.args?.content ?? "").length} chars)`;
  if (call.name === "Edit") return `${call.args?.file_path} (${String(call.args?.old_string ?? "").length} → ${String(call.args?.new_string ?? "").length} chars)`;
  if (call.name === "MultiEdit") return `${call.args?.file_path} (${Array.isArray(call.args?.edits) ? call.args.edits.length : 0} edits)`;
  if (call.name === "computer_write_file") return `${call.args?.path} (${String(call.args?.content ?? "").length} chars)`;
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
  // A live countdown (WaitCountdown) is drawn on screen; not written to the transcript (scheduler)
  inp.onWait = inp.onWait || ((sec) => emit(`\n\n[[wait:${Date.now() + sec * 1000}]]\n\n`));
  // Memory (Claude-style): when enabled, past facts are injected and a `remember` tool is offered. When off, neither.
  const mem = inp.user ? await getMemory(inp.user).catch(() => null) : null;
  const memoryOn = !!(mem && mem.enabled && inp.user);
  // The skills catalog: local filesystem when reachable here, otherwise fetched from the owner's real
  // computer over HTTP — so this also works when the frontend runs elsewhere (e.g. Vercel).
  const skillsList = await getSkillsAsync();
  try {
    const notes: string[] = [];
    const env = { serverUrl: inp.serverUrl, appUrl: inp.appUrl, keyId: inp.keyId, user: inp.user, signal: inp.signal, allowScheduling: !inp.scheduled };
    // Coding tools fully replace computer_exec/read/write/job_* — duplicate tools would confuse the model
    const builtin = buildBuiltinTools(env).filter((t) => !SUPERSEDED_BUILTINS.has(t.name));
    const coding = buildCodingTools(makeServerCtx(env));
    const mcp = inp.connectors?.length ? await loadMcpTools(inp.connectors, clients, notes) : [];
    let tools: ToolDef[] = [];
    const seen = new Set<string>();
    const memoryTools: ToolDef[] = memoryOn
      ? [
          {
            name: "remember",
            label: "Remember",
            description:
              "Save a durable fact to long-term memory (the user's name/role, preferences, recurring project context, decisions). Use it on your own whenever you learn something worth recalling in future chats — one concise fact per call. Do not save secrets, passwords or one-off trivia.",
            parameters: { type: "object", properties: { fact: { type: "string", description: "one concise fact to remember" } }, required: ["fact"] },
            run: async (a: any) => {
              const it = await addMemory(inp.user!, String(a?.fact || ""));
              return { output: it ? `Saved to memory: ${it.text}` : "Nothing saved (empty or already known)." };
            },
          },
        ]
      : [];
    for (const t of [...coding, ...buildSkillTools(skillsList), ...memoryTools, ...builtin, ...mcp]) {
      if (seen.has(t.name)) {
        notes.push(`Duplicate tool name skipped: ${t.name}`);
        continue;
      }
      seen.add(t.name);
      tools.push(t);
    }
    if (tools.length > MAX_TOOLS) {
      notes.push(`Too many tools (${tools.length}); using the first ${MAX_TOOLS}.`);
      tools = tools.slice(0, MAX_TOOLS);
    }
    for (const n of notes) out(`> ${n}\n\n`);
    const byName = new Map(tools.map((t) => [t.name, t]));

    // The behavioural instruction lives entirely in the user's system prompt (Settings → General) — nothing
    // hidden is injected from code. Only runtime DATA is appended: the skills catalog and any saved memories.
    let memBlock = "";
    if (memoryOn) {
      const items = mem!.items.slice(-60);
      memBlock = items.length ? "\n\nSAVED MEMORY (facts already known about the user — use these directly, do not call tools to look them up again):\n" + items.map((m) => `- ${m.text}`).join("\n") : "";
    }
    let system = withSkillsCatalog(applyPromptVars(inp.system || ""), skillsList) + memBlock; // skills: catalog data only (names)
    // "/skill-name ..." in the last user message loads that skill up-front (like a slash command)
    const lastUser = [...(inp.messages || [])].reverse().find((m) => m.role === "user");
    const slash = lastUser && /^\s*\/([A-Za-z0-9][\w./-]*)\s*([\s\S]*)$/.exec(String(lastUser.content || ""));
    if (slash && skillsList.length) {
      const { skill } = findSkill(slash[1], skillsList);
      if (skill) {
        system += `\n\nThe user invoked the skill "${skill.name}" with a slash command. It is already loaded below: follow it, do not load it again.\n\n` + (await loadSkillText(skill, slash[2]));
      }
    }
    const adapter = inp.provider === "anthropic" ? anthropicAdapter(inp, system) : openaiAdapter(inp, system);
    const maxSteps = Math.min(Math.max(1, inp.maxSteps ?? 100), 1000);
    let final = "";
    let steps = 0;
    let emptyRetries = 0; // consecutive empty model replies (no text, no tool call)
    const failCounts = new Map<string, number>(); // same tool+args repeated-failure guard, across this whole run

    for (; steps < maxSteps; steps++) {
      if (inp.signal?.aborted) break;
      let res: StepResult;
      try {
        res = await adapter.step(tools);
      } catch (e: any) {
        if (steps === 0 && e?.toolRelated && "disableTools" in adapter) {
          (adapter as any).disableTools();
          tools = [];
          out("> This model does not support tool calling, so I will answer in plain chat mode. Choose a model that supports tool calling to use tools.\n\n");
          res = await adapter.step(tools);
        } else {
          throw e;
        }
      }
      if (res.usage) {
        recordUsage(inp.user, inp.serverUrl, {
          provider: inp.provider,
          model: defaultModel(inp.provider, inp.model),
          keyId: inp.keyId,
          source: inp.scheduled ? "task" : "agent",
          chatId: inp.chatId,
          ...res.usage,
        });
      }
      const emptyReply = !res.text.trim() && !res.calls.length;
      if (emptyReply && emptyRetries < 2 && adapter.dropEmpty) {
        // Some models (e.g. gpt-oss on Groq) occasionally return nothing after a tool result. Retry the step
        // instead of silently stopping the whole run.
        emptyRetries++;
        adapter.dropEmpty();
        steps--;
        continue;
      }
      emptyRetries = 0;
      if (res.text.trim()) {
        out(res.text.replace(/\s+$/, "") + "\n\n");
        final = res.text;
      }
      if (!res.calls.length) {
        if (emptyReply) out('> The model sent an empty reply. Type "continue" to go on.\n\n');
        break;
      }

      const results: Array<{ call: Call; output: string; isError: boolean }> = [];
      for (const call of res.calls) {
        const tool = byName.get(call.name);
        out(`\n> **Tool:** \`${tool?.label || call.name}\`\n\n`);
        let r: { output: string; isError?: boolean };
        const t0 = Date.now();
        // A model sometimes retries the exact same failing call repeatedly instead of giving up. After 2
        // real attempts, stop calling it again (saves a pointless network round trip) and say so firmly.
        const sig = call.name + ":" + JSON.stringify(call.args);
        const priorFails = failCounts.get(sig) || 0;
        if (priorFails >= 2) {
          r = { output: `Skipped: this exact call already failed ${priorFails} times in a row. Do not retry it again — continue the reply without it.`, isError: true };
        } else if (call.argError) r = { output: call.argError, isError: true };
        else if (!tool) r = { output: `Unknown tool: ${call.name}`, isError: true };
        else {
          try {
            r = await tool.run(call.args);
          } catch (e: any) {
            r = { output: `Tool error: ${e?.message || e}`, isError: true };
          }
        }
        if (r.isError) failCounts.set(sig, priorFails + 1);
        else failCounts.delete(sig);
        const shown = (call.name === "computer_exec" || call.name === "Bash" ? `$ ${brief(call)}\n` : `${brief(call)}\n`) + `→ ${r.isError ? "ERROR" : "ok"} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${r.output}`;
        out(fence(shown));
        results.push({ call, output: r.output, isError: !!r.isError });
      }
      adapter.addResults(results);
    }
    if (steps >= maxSteps) out(`> Step limit reached (${maxSteps}). Type "continue" to go on.\n\n`);
    return { final, transcript, steps };
  } finally {
    await Promise.allSettled(clients.map((c) => c.close()));
  }
}
