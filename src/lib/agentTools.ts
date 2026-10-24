// Agent tools: computer (local Python server), files, background jobs, scheduler.
import { serverFetch } from "@/lib/serverAuth";

export interface ToolDef {
  name: string; // name sent to the provider
  label: string; // shown in the UI
  description: string;
  parameters: Record<string, any>;
  readOnly?: boolean; // true: does not change state (Read/Glob/Grep/LS/BashOutput)
  run: (args: any) => Promise<{ output: string; isError?: boolean }>;
}

export interface ToolEnv {
  serverUrl?: string;
  appUrl?: string;
  keyId?: string;
  user?: string;
  signal?: AbortSignal;
  allowScheduling: boolean;
}

const OUT_LIMIT = 12000;

function clip(s: string, limit = OUT_LIMIT): string {
  if (s.length <= limit) return s;
  const head = Math.floor(limit * 0.6);
  const tail = limit - head;
  return `${s.slice(0, head)}\n...[${s.length - limit} belgi qisqartirildi]...\n${s.slice(-tail)}`;
}

function shq(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function fmtExec(r: any): { output: string; isError: boolean } {
  const out = [`exit=${r.exit_code}`];
  if (r.stdout) out.push(String(r.stdout));
  if (r.stderr) out.push(`[stderr]\n${r.stderr}`);
  return { output: clip(out.join("\n")), isError: r.exit_code !== 0 };
}

// Shared helpers that call the local Python server (builtin and coding tools use the same channel)
export function makeServerCtx(env: ToolEnv) {
  const sf = (path: string, body?: any, method?: string, timeoutMs?: number) =>
    serverFetch(env.serverUrl, path, { body, method, timeoutMs, signal: env.signal, user: env.user });
  const exec = (command: string, timeout = 60, cwd?: string, background = false) =>
    sf("/exec", { command, cwd, timeout, background }, "POST", (timeout + 20) * 1000);
  return { sf, exec };
}

export function buildBuiltinTools(env: ToolEnv): ToolDef[] {
  const { sf, exec: execRaw } = makeServerCtx(env);

  const tools: ToolDef[] = [
    {
      name: "computer_exec",
      label: "Computer",
      description:
        "Runs a bash command on the owner's REAL Linux computer (no sandbox; default folder ~/MR/mrai/work, files persist). Multi-line scripts are fine. For long-running processes (dev server, build, watcher) pass background=true and follow them with computer_job_logs.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "bash command/script" },
          cwd: { type: "string", description: "working folder (any existing folder, default ~/MR/mrai/work), optional" },
          timeout: { type: "number", description: "in seconds, default 60, maximum 600" },
          background: { type: "boolean", description: "run as a background job (returns job_id)" },
        },
        required: ["command"],
      },
      run: async (a) => {
        const t = Math.min(Math.max(Number(a.timeout) || 60, 1), 600);
        return fmtExec(await execRaw(String(a.command || ""), t, a.cwd, !!a.background));
      },
    },
    {
      name: "computer_read_file",
      label: "Read file",
      description: "Reads the text of a file on the computer (default 20000 bytes, maximum 100000).",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, max_bytes: { type: "number" } },
        required: ["path"],
      },
      run: async (a) => {
        const n = Math.min(Math.max(Number(a.max_bytes) || 20000, 1), 100000);
        return fmtExec(await execRaw(`head -c ${n} -- ${shq(a.path)}`, 30));
      },
    },
    {
      name: "computer_write_file",
      label: "Write file",
      description: "Creates or overwrites a file on the computer (folders are created automatically). With append=true it appends to the end.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" }, append: { type: "boolean" } },
        required: ["path", "content"],
      },
      run: async (a) => {
        const b64 = Buffer.from(String(a.content ?? ""), "utf8").toString("base64");
        const CH = 90000; // 4 ga karrali
        let mode = a.append ? ">>" : ">";
        let last: any = await execRaw(`mkdir -p "$(dirname -- ${shq(a.path)})"`, 30);
        for (let i = 0; i < Math.max(b64.length, 1); i += CH) {
          last = await execRaw(`printf %s ${shq(b64.slice(i, i + CH))} | base64 -d ${mode} ${shq(a.path)}`, 60);
          if (last.exit_code !== 0) return fmtExec(last);
          mode = ">>";
        }
        return { output: `yozildi: ${a.path} (${Buffer.byteLength(String(a.content ?? ""))} bayt)` };
      },
    },
    {
      name: "computer_job_logs",
      label: "Fon jarayon logi",
      description: "Returns the status and the last log lines of a background job (job_id).",
      parameters: {
        type: "object",
        properties: { job_id: { type: "string" }, tail: { type: "number", description: "number of last lines, default 80" } },
        required: ["job_id"],
      },
      run: async (a) => {
        const r = await sf(`/api/jobs/logs?id=${encodeURIComponent(a.job_id)}&tail=${Number(a.tail) || 80}`);
        if (r.error) return { output: r.error, isError: true };
        return { output: clip(`running=${r.running} exit=${r.exit_code}\n${r.output || ""}`) };
      },
    },
    {
      name: "computer_job_kill",
      label: "Stop background job",
      description: "Stops a background job (job_id).",
      parameters: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
      run: async (a) => {
        const r = await sf("/api/jobs/kill", { id: a.job_id });
        return r.error ? { output: r.error, isError: true } : { output: "stopped" };
      },
    },
    {
      name: "list_tasks",
      label: "List tasks",
      description: "Lists the scheduled tasks.",
      parameters: { type: "object", properties: {} },
      run: async () => {
        const rows = await sf("/api/db/tasks");
        if (!Array.isArray(rows)) return { output: JSON.stringify(rows), isError: true };
        if (!rows.length) return { output: "No tasks" };
        return {
          output: rows
            .map((t: any) => `${t.id} | ${t.name} | ${t.kind} | ${t.schedule} | ${t.enabled ? "enabled" : "disabled"} | next: ${t.next_run ? new Date(t.next_run * 1000).toISOString() : "-"} | oxirgi: ${t.last_status || "-"}`)
            .join("\n"),
        };
      },
    },
    {
      name: "delete_task",
      label: "Delete task",
      description: "Deletes a scheduled task by id.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      run: async (a) => {
        const r = await sf(`/api/db/tasks?id=${encodeURIComponent(a.id)}`, undefined, "DELETE");
        return r.error ? { output: r.error, isError: true } : { output: "deleted" };
      },
    },
  ];

  if (env.allowScheduling) {
    tools.push({
      name: "schedule_task",
      label: "Schedule task",
      description:
        "Schedules a task to run automatically (the local server runs 24/7). Schedule formats: 'every 15m' | 'every 2h' | 'daily 09:00' | 'weekdays 18:30' | 'once 2026-10-25 09:00' | 'cron: */5 * * * *' (server local time). kind='ai': each time the agent runs the prompt with tools; kind='shell': a plain command.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["ai", "shell"] },
          schedule: { type: "string" },
          prompt: { type: "string", description: "for kind=ai: a complete, self-explanatory instruction" },
          command: { type: "string", description: "bash command for kind=shell" },
        },
        required: ["name", "kind", "schedule"],
      },
      run: async (a) => {
        const r = await sf("/api/db/tasks", {
          name: a.name, kind: a.kind, schedule: a.schedule, prompt: a.prompt || "", command: a.command || "",
          app_url: env.appUrl || "", server_url: env.serverUrl || "", key_id: env.keyId || "",
        });
        if (r.error) return { output: r.error, isError: true };
        return { output: `task created (id=${r.id}). Next run: ${r.next_run ? new Date(r.next_run * 1000).toString() : "-"}` };
      },
    });
  }
  // Present to the user as a file card (in chat: click to preview, with a download button).
  // Chiqish formati ("@file\t<hajm>\t<yo'l>") chat UI (components/chat/parse.ts) tomonidan kartochkaga aylantiriladi.
  tools.push({
    name: "present_files",
    label: "Share file",
    readOnly: true,
    description:
      "Gives finished file(s) to the user in the chat as a CARD (not markdown): zip/html/image/pdf/code/text. The card has a live preview and a Download button. Once a file is ready you MUST call this tool: do not write the path in text, do not write <|present_files|...>, only make the tool call. paths: full absolute paths (for example /home/user/a.txt).",

    parameters: {
      type: "object",
      properties: {
        paths: { type: "array", items: { type: "string" }, description: "full paths of the files (at most 20)" },
      },
      required: ["paths"],
    },
    run: async (a) => {
      const raw = Array.isArray(a.paths) ? a.paths : [a.paths ?? a.path];
      const paths: string[] = raw.map((p: any) => String(p ?? "").trim()).filter(Boolean).slice(0, 20);
      if (!paths.length) return { output: "paths is empty: give a file path", isError: true };
      const script = paths
        .map(
          (p) =>
            `f=${shq(p)}; case "$f" in "~/"*) f="$HOME/\${f#\\~/}";; esac; ` +
            `if [ -f "$f" ]; then printf '@file\\t%s\\t%s\\n' "$(stat -c %s -- "$f")" "$(realpath -- "$f")"; else printf '@err\\t%s\\n' "$f"; fi`
        )
        .join("\n");
      const r = await execRaw(script, 30);
      const lines = String(r.stdout || "").split("\n");
      const files = lines.filter((l) => l.startsWith("@file\t"));
      const bad = lines.filter((l) => l.startsWith("@err\t")).map((l) => l.slice(5));
      if (!files.length) return { output: `File not found: ${(bad.length ? bad : paths).join(", ")}`, isError: true };
      return { output: files.join("\n") + (bad.length ? `\n(not found: ${bad.join(", ")})` : "") };
    },
  });
  return tools;
}
