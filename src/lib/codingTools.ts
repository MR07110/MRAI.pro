// Claude Code uslubidagi kod asboblari: Bash, Read, Write, Edit, MultiEdit, Glob, Grep, LS, TodoWrite, BashOutput, KillShell.
// Hammasi local serverdagi bwrap sandbox (/exec) ustida ishlaydi.
import type { ToolDef } from "@/lib/agentTools";

export interface CodingCtx {
  exec: (command: string, timeoutSec?: number, cwd?: string, background?: boolean) => Promise<any>;
  sf: (path: string, body?: any, method?: string, timeoutMs?: number) => Promise<any>;
}

const BASH_LIMIT = 30000;
const READ_CHARS = 60000;
const EDIT_MAX_BYTES = 300000;

function clip(s: string, limit = BASH_LIMIT): string {
  if (s.length <= limit) return s;
  const head = Math.floor(limit * 0.6);
  return `${s.slice(0, head)}\n...[${s.length - limit} chars truncated]...\n${s.slice(-(limit - head))}`;
}
function shq(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
const fail = (output: string) => ({ output, isError: true });
const ok = (output: string) => ({ output });
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

function numbered(text: string, start: number): string {
  return text.split("\n").map((l, i) => `${String(start + i).padStart(6)}\t${l}`).join("\n");
}

function countOf(text: string, needle: string): number {
  if (!needle) return 0;
  let n = 0, i = 0;
  while ((i = text.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

function applyEdits(text: string, edits: any[]): { text?: string; error?: string; firstLine?: number } {
  let cur = text;
  let firstLine: number | undefined;
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i] || {};
    const o = String(e.old_string ?? "");
    const n = String(e.new_string ?? "");
    const tag = edits.length > 1 ? `Edit #${i + 1}: ` : "";
    if (!o) return { error: `${tag}old_string must not be empty (use Write to create a file).` };
    if (o === n) return { error: `${tag}old_string and new_string are identical.` };
    const c = countOf(cur, o);
    if (c === 0) return { error: `${tag}old_string not found in file. Copy it exactly from Read output (whitespace, tabs and indentation must match; do not include line-number prefixes).` };
    if (c > 1 && !e.replace_all) return { error: `${tag}old_string matches ${c} places. Add more surrounding context to make it unique, or set replace_all=true.` };
    const idx = cur.indexOf(o);
    if (firstLine === undefined) firstLine = cur.slice(0, idx).split("\n").length;
    cur = e.replace_all ? cur.split(o).join(n) : cur.slice(0, idx) + n + cur.slice(idx + o.length);
  }
  return { text: cur, firstLine };
}

export function buildCodingTools(ctx: CodingCtx): ToolDef[] {
  const reads = new Map<string, string>(); // real path -> mtime ("Read before Edit/Write" qoidasi uchun)
  let cwd: string | undefined; // Bash chaqiruvlari orasida saqlanadi
  let todos: Array<{ content: string; status: string }> = [];
  const run = (cmd: string, t = 60) => ctx.exec(cmd, t, cwd);
  const kv = (stdout: string, key: string): string | undefined => {
    const l = String(stdout).split("\n").find((x) => x.startsWith(key));
    return l === undefined ? undefined : l.slice(key.length);
  };

  async function meta(path: string): Promise<any> {
    const r = await run(
      `f=${shq(path)}; if [ ! -e "$f" ]; then echo __ENOENT__; elif [ -d "$f" ]; then echo __ISDIR__; else echo "__REAL__:$(realpath -m -- "$f")"; echo "__MTIME__:$(stat -c %y -- "$f")"; echo "__SIZE__:$(stat -c %s -- "$f")"; fi`,
      30
    );
    const o = String(r.stdout || "");
    if (o.includes("__ENOENT__")) return { exists: false };
    if (o.includes("__ISDIR__")) return { exists: true, isDir: true };
    return { exists: true, real: kv(o, "__REAL__:") || path, mtime: kv(o, "__MTIME__:") || "", size: Number(kv(o, "__SIZE__:") || 0) };
  }

  async function loadText(path: string): Promise<{ error?: string; missing?: boolean; text?: string; real?: string; mtime?: string }> {
    const m = await meta(path);
    if (!m.exists) return { missing: true };
    if (m.isDir) return { error: `${path} is a directory.` };
    if (m.size > EDIT_MAX_BYTES) return { error: `File is too large (${m.size} bytes) for Edit (limit ${EDIT_MAX_BYTES}). Use Bash with sed/python for bulk changes.` };
    const r = await run(`base64 -w0 -- ${shq(path)}`, 60);
    if (r.exit_code !== 0) return { error: String(r.stderr || "read failed") };
    const buf = Buffer.from(String(r.stdout || "").trim(), "base64");
    const text = buf.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(buf)) return { error: "File is not valid UTF-8 text (binary?). Cannot edit it." };
    return { text, real: m.real, mtime: m.mtime };
  }

  async function putText(path: string, text: string): Promise<{ error?: string; real?: string; mtime?: string }> {
    const b64 = Buffer.from(text, "utf8").toString("base64");
    const CH = 90000; // 4 ga karrali
    let last: any = await run(`mkdir -p -- "$(dirname -- ${shq(path)})"`, 30);
    if (last.exit_code !== 0) return { error: String(last.stderr || "mkdir failed") };
    let mode = ">";
    for (let i = 0; i < Math.max(b64.length, 1); i += CH) {
      last = await run(`printf %s ${shq(b64.slice(i, i + CH))} | base64 -d ${mode} ${shq(path)}`, 60);
      if (last.exit_code !== 0) return { error: String(last.stderr || "write failed") };
      mode = ">>";
    }
    const m = await meta(path);
    return { real: m.real || path, mtime: m.mtime || "" };
  }

  function snippet(text: string, line: number, span: number): string {
    const ls = text.split("\n");
    const from = Math.max(1, line - 4);
    const to = Math.min(ls.length, line + span + 4);
    return numbered(ls.slice(from - 1, to).join("\n"), from);
  }

  const tools: ToolDef[] = [];

  tools.push({
    name: "Bash",
    label: "Bash",
    description:
      "Executes a bash command in the user's Linux sandbox (workspace directory; files persist; the working directory persists between calls). Use it for git, npm/pip, builds, tests and running scripts. Do NOT use it to read, search or edit files when Read/Grep/Glob/Edit can do it. Default timeout 120000 ms (max 600000). For dev servers, watchers and other long jobs set run_in_background=true, then use BashOutput and KillShell. Quote paths containing spaces. Network is available; /usr is read-only (no apt) - install packages into the workspace.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The bash command or script to run" },
        description: { type: "string", description: "Short (5-10 words) description of what the command does" },
        timeout: { type: "number", description: "Timeout in milliseconds (default 120000, max 600000)" },
        run_in_background: { type: "boolean", description: "Run as a background job; returns a bash_id" },
      },
      required: ["command"],
    },
    run: async (a) => {
      const command = String(a.command ?? "");
      if (!command.trim()) return fail("command is required");
      if (a.run_in_background) {
        const r = await ctx.exec(`{ ${command}\n}`, 600, cwd, true); // { } : server "cd ..." bilan boshlangan buyruqni o'zi yutib yubormasligi uchun
        if (r.job_id) return ok(`Background shell started. bash_id=${r.job_id}. Use BashOutput to read its output and KillShell to stop it.`);
        return fail(String(r.stderr || r.stdout || "failed to start background job"));
      }
      const sec = Math.ceil(clamp(Number(a.timeout) || 120000, 1000, 600000) / 1000);
      const wrapped = `{ ${command}\n}; __mrai_ec=$?; printf '\\n<<MRAI_PWD:%s>>' "$PWD" >&2; exit $__mrai_ec`;
      const r = await ctx.exec(wrapped, sec, cwd);
      let stderr = String(r.stderr || "");
      const m = stderr.match(/\n?<<MRAI_PWD:(.*?)>>\s*$/);
      if (m) {
        stderr = stderr.slice(0, m.index);
        if (m[1].startsWith("/")) cwd = m[1];
      }
      const stdout = String(r.stdout || "").replace(/\s+$/, "");
      const parts = [stdout, stderr.replace(/\s+$/, "")].filter(Boolean);
      let out = parts.join("\n");
      if (r.exit_code !== 0) out += `${out ? "\n" : ""}Exit code ${r.exit_code}`;
      return { output: clip(out || "(no output)"), isError: r.exit_code !== 0 };
    },
  });

  tools.push({
    name: "Read",
    label: "Read",
    readOnly: true,
    description:
      "Reads a text file from the sandbox. file_path is relative to the working directory or absolute. Returns up to 2000 lines, each prefixed with its line number (cat -n style: number, tab, content); use offset (1-based line) and limit for large files. You MUST Read a file before you Edit or overwrite it. Lines longer than 2000 chars are cut. Use LS for directories.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        offset: { type: "number", description: "1-based line to start from" },
        limit: { type: "number", description: "Number of lines (default 2000)" },
      },
      required: ["file_path"],
    },
    run: async (a) => {
      const path = String(a.file_path ?? "");
      if (!path) return fail("file_path is required");
      const start = Math.max(1, Math.floor(Number(a.offset) || 1));
      const lim = clamp(Math.floor(Number(a.limit) || 2000), 1, 5000);
      const end = start + lim - 1;
      const script = `f=${shq(path)}
if [ ! -e "$f" ]; then echo __ENOENT__; exit 0; fi
if [ -d "$f" ]; then echo __ISDIR__; exit 0; fi
echo "__REAL__:$(realpath -m -- "$f")"
echo "__MTIME__:$(stat -c %y -- "$f")"
if [ -s "$f" ] && ! grep -Iq '' "$f"; then echo __BINARY__; exit 0; fi
echo "__LINES__:$(wc -l < "$f")"
echo __BEGIN__
awk -v s=${start} -v e=${end} 'NR>=s && NR<=e { l=$0; if (length(l)>2000) l=substr(l,1,2000) "..."; printf "%6d\\t%s\\n", NR, l } NR>e { exit }' "$f"`;
      const r = await run(script, 30);
      const o = String(r.stdout || "");
      if (r.exit_code !== 0 && !o) return fail(String(r.stderr || "read failed"));
      if (o.includes("__ENOENT__")) return fail(`File not found: ${path}`);
      if (o.includes("__ISDIR__")) return fail(`${path} is a directory. Use LS to list it.`);
      if (o.includes("__BINARY__")) return fail(`${path} is a binary file; Read only supports text files.`);
      const real = kv(o, "__REAL__:") || path;
      reads.set(real, kv(o, "__MTIME__:") || "");
      const total = Number(kv(o, "__LINES__:") || 0);
      const bi = o.indexOf("__BEGIN__\n");
      let body = bi >= 0 ? o.slice(bi + 10).replace(/\n$/, "") : "";
      if (!body) return ok(total === 0 ? "(file is empty)" : `(no lines in range; file has ${total} lines)`);
      if (body.length > READ_CHARS) body = body.slice(0, READ_CHARS) + "\n...[output truncated; use a smaller limit or a larger offset]";
      if (total > end) body += `\n...[${total - end} more lines; continue with offset=${end + 1}]`;
      return ok(body);
    },
  });

  tools.push({
    name: "Write",
    label: "Write",
    description:
      "Writes a file (creates it or overwrites it entirely); parent directories are created automatically. If the file already exists you MUST Read it first in this session. Prefer Edit for changes to existing files; use Write for new files or complete rewrites. Do not create documentation files (README etc.) unless asked.",
    parameters: {
      type: "object",
      properties: { file_path: { type: "string" }, content: { type: "string", description: "Full file content" } },
      required: ["file_path", "content"],
    },
    run: async (a) => {
      const path = String(a.file_path ?? "");
      if (!path) return fail("file_path is required");
      const content = String(a.content ?? "");
      const m = await meta(path);
      if (m.exists && m.isDir) return fail(`${path} is a directory.`);
      if (m.exists) {
        const seen = reads.get(m.real);
        if (seen === undefined) return fail("File already exists. Read it first before overwriting it.");
        if (seen !== m.mtime) return fail("File changed on disk since you last read it. Read it again before overwriting.");
      }
      const r = await putText(path, content);
      if (r.error) return fail(r.error);
      reads.set(r.real!, r.mtime!);
      const n = content === "" ? 0 : content.split("\n").length;
      return ok(`${m.exists ? "Updated" : "Created"} ${path} (${n} lines, ${Buffer.byteLength(content)} bytes)`);
    },
  });

  const editImpl = async (path: string, edits: any[]) => {
    if (!path) return fail("file_path is required");
    const L = await loadText(path);
    if (L.error) return fail(L.error);
    if (L.missing) {
      if (edits.length === 1 && String(edits[0]?.old_string ?? "") === "") {
        const r = await putText(path, String(edits[0].new_string ?? ""));
        if (r.error) return fail(r.error);
        reads.set(r.real!, r.mtime!);
        return ok(`Created ${path}`);
      }
      return fail(`File not found: ${path}`);
    }
    const seen = reads.get(L.real!);
    if (seen === undefined) return fail("You must Read this file before editing it.");
    if (seen !== L.mtime) return fail("File changed on disk since you last read it. Read it again, then retry the edit.");
    const res = applyEdits(L.text!, edits);
    if (res.error) return fail(res.error);
    const r = await putText(path, res.text!);
    if (r.error) return fail(r.error);
    reads.set(r.real!, r.mtime!);
    const span = Math.max(0, String(edits[0]?.new_string ?? "").split("\n").length - 1);
    return ok(`Edited ${path}. Snippet of the result:\n${snippet(res.text!, res.firstLine || 1, span)}`);
  };

  tools.push({
    name: "Edit",
    label: "Edit",
    description:
      "Performs an exact string replacement in a file. You MUST Read the file first. old_string must match the file text exactly (indentation and whitespace included, without the line-number prefixes from Read) and must be unique unless replace_all=true. Use replace_all to rename a symbol across the file. To create a new file with Edit, pass an empty old_string for a path that does not exist.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        old_string: { type: "string", description: "Exact text to replace" },
        new_string: { type: "string", description: "Replacement text (must differ from old_string)" },
        replace_all: { type: "boolean", description: "Replace every occurrence (default false)" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
    run: async (a) => editImpl(String(a.file_path ?? ""), [{ old_string: a.old_string, new_string: a.new_string, replace_all: !!a.replace_all }]),
  });

  tools.push({
    name: "MultiEdit",
    label: "MultiEdit",
    description:
      "Applies several Edit operations to one file sequentially and atomically (if any edit fails nothing is written). Each later edit sees the result of the earlier ones. Prefer this over repeated Edit calls on the same file. Same rules as Edit: Read first, exact unique old_string.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: { old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } },
            required: ["old_string", "new_string"],
          },
        },
      },
      required: ["file_path", "edits"],
    },
    run: async (a) => {
      if (!Array.isArray(a.edits) || !a.edits.length) return fail("edits must be a non-empty array");
      return editImpl(String(a.file_path ?? ""), a.edits);
    },
  });

  tools.push({
    name: "Glob",
    label: "Glob",
    readOnly: true,
    description:
      "Fast file search by glob pattern (e.g. \"**/*.ts\", \"src/**/*.tsx\", \"*.json\"). Respects .gitignore. Returns up to 100 paths sorted by modification time (newest first). Use Grep to search inside files.",
    parameters: {
      type: "object",
      properties: { pattern: { type: "string" }, path: { type: "string", description: "Directory to search (default: working directory)" } },
      required: ["pattern"],
    },
    run: async (a) => {
      const pattern = String(a.pattern ?? "");
      if (!pattern) return fail("pattern is required");
      const base = a.path ? shq(String(a.path)) : ".";
      const r = await run(
        `__d=${base}; [ -d "$__d" ] || { echo __NODIR__; exit 0; }; cd "$__d" || exit 0
rg --files --hidden --no-messages -g '!.git' -g ${shq(pattern)} -0 . 2>/dev/null | xargs -0 -r stat -c '%Y %n' 2>/dev/null | sort -rn | head -101 | cut -d' ' -f2- | sed 's#^\\./##'`,
        60
      );
      const o = String(r.stdout || "").trim();
      if (o === "__NODIR__") return fail(`Directory not found: ${a.path}`);
      if (!o) return ok("No files found");
      const ls = o.split("\n");
      return ok(ls.slice(0, 100).join("\n") + (ls.length > 100 ? "\n(results truncated; narrow the pattern or path)" : ""));
    },
  });

  tools.push({
    name: "Grep",
    label: "Grep",
    readOnly: true,
    description:
      "Search file contents with ripgrep (regex). output_mode: files_with_matches (default), content (matching lines with line numbers), count. Filter with glob (e.g. \"*.ts\") or type (e.g. \"py\", \"js\"). Use case_insensitive for case-insensitive search, after/before/context for context lines in content mode, multiline for patterns spanning lines, head_limit to cap results (default 250). Always prefer this over running grep/rg in Bash.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression" },
        path: { type: "string", description: "File or directory (default: working directory)" },
        glob: { type: "string" },
        type: { type: "string" },
        output_mode: { type: "string", enum: ["content", "files_with_matches", "count"] },
        case_insensitive: { type: "boolean", description: "Case-insensitive search (rg -i)" },
        line_numbers: { type: "boolean", description: "Show line numbers (content mode, default true)" },
        after: { type: "number", description: "Lines of context after each match (rg -A)" },
        before: { type: "number", description: "Lines of context before each match (rg -B)" },
        context: { type: "number", description: "Lines of context around each match (rg -C)" },
        multiline: { type: "boolean" },
        head_limit: { type: "number" },
      },
      required: ["pattern"],
    },
    run: async (a) => {
      const pattern = String(a.pattern ?? "");
      if (!pattern) return fail("pattern is required");
      const mode = String(a.output_mode || "files_with_matches");
      const args: string[] = ["rg", "--no-messages", "--hidden", "-g", "'!.git'"];
      const pick = (...keys: string[]) => keys.map((k) => a[k]).find((v) => v !== undefined && v !== null);
      if (pick("case_insensitive", "-i", "i")) args.push("-i");
      if (mode === "files_with_matches") args.push("-l");
      else if (mode === "count") args.push("-c");
      else {
        if (pick("line_numbers", "-n", "n") !== false) args.push("-n");
        for (const [flag, names] of [["-A", ["after", "-A", "A"]], ["-B", ["before", "-B", "B"]], ["-C", ["context", "-C", "C"]]] as Array<[string, string[]]>) {
          const v = Math.floor(Number(pick(...names)));
          if (v > 0) args.push(flag, String(Math.min(v, 20)));
        }
      }
      if (a.multiline) args.push("-U", "--multiline-dotall");
      if (a.glob) args.push("-g", shq(String(a.glob)));
      if (a.type) args.push("-t", shq(String(a.type)));
      const limit = clamp(Math.floor(Number(a.head_limit)) || 250, 1, 2000);
      args.push("-e", shq(pattern), "--", shq(String(a.path || ".")));
      const r = await run(`${args.join(" ")} 2>&1 | head -${limit + 1}`, 60);
      const o = String(r.stdout || "").replace(/\s+$/, "");
      if (!o) return ok("No matches found");
      const ls = o.split("\n");
      const body = ls.slice(0, limit).join("\n");
      return ok(clip(body + (ls.length > limit ? `\n(results truncated at ${limit}; refine the pattern or raise head_limit)` : ""), 30000));
    },
  });

  tools.push({
    name: "LS",
    label: "LS",
    readOnly: true,
    description: "Lists the entries of a directory (non-recursive; directories first). Prefer Glob/Grep when you know what you are looking for.",
    parameters: { type: "object", properties: { path: { type: "string", description: "Directory (default: working directory)" } } },
    run: async (a) => {
      const p = String(a.path || ".");
      const r = await run(`p=${shq(p)}; [ -d "$p" ] || { echo __NODIR__; exit 0; }; find "$p" -mindepth 1 -maxdepth 1 -printf '%y\\t%s\\t%f\\n'`, 30);
      const o = String(r.stdout || "").trim();
      if (o === "__NODIR__") return fail(`Not a directory: ${p}`);
      if (!o) return ok("(empty directory)");
      const rows = o.split("\n").map((l) => l.split("\t"));
      rows.sort((x, y) => (x[0] === "d" ? 0 : 1) - (y[0] === "d" ? 0 : 1) || String(x[2]).localeCompare(String(y[2])));
      const lines = rows.slice(0, 300).map((x) => (x[0] === "d" ? `- ${x[2]}/` : `- ${x[2]} (${x[1]} B)`));
      return ok(lines.join("\n") + (rows.length > 300 ? `\n...[${rows.length - 300} more]` : ""));
    },
  });

  tools.push({
    name: "TodoWrite",
    label: "TodoWrite",
    description:
      "Creates and updates a structured task list for the current multi-step job. Use it proactively for tasks with 3+ steps: write the plan first, keep exactly one item in_progress, and mark items completed immediately when done. Each call replaces the whole list. Skip it for trivial one-step requests.",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "Imperative task, e.g. 'Run the tests'" },
              status: { type: "string", enum: ["pending", "in_progress", "completed"] },
              activeForm: { type: "string", description: "Present-continuous form, e.g. 'Running the tests'" },
            },
            required: ["content", "status"],
          },
        },
      },
      required: ["todos"],
    },
    run: async (a) => {
      const list = Array.isArray(a.todos) ? a.todos : [];
      todos = list.map((t: any) => ({
        content: String(t?.content ?? ""),
        status: ["pending", "in_progress", "completed"].includes(t?.status) ? t.status : "pending",
      }));
      const icon: Record<string, string> = { pending: "[ ]", in_progress: "[~]", completed: "[x]" };
      return ok("Todo list updated:\n" + (todos.map((t) => `${icon[t.status]} ${t.content}`).join("\n") || "(empty)"));
    },
  });

  tools.push({
    name: "BashOutput",
    label: "BashOutput",
    readOnly: true,
    description: "Reads the latest output and status of a background shell started with Bash(run_in_background=true). Optionally filter lines with a regex.",
    parameters: {
      type: "object",
      properties: { bash_id: { type: "string" }, filter: { type: "string", description: "Regex; only matching lines are returned" } },
      required: ["bash_id"],
    },
    run: async (a) => {
      let r: any;
      try {
        r = await ctx.sf(`/api/jobs/logs?id=${encodeURIComponent(String(a.bash_id))}&tail=300`);
      } catch (e: any) {
        return fail(`BashOutput failed: ${e?.message || e} (unknown or expired bash_id?)`);
      }
      if (r?.error) return fail(String(r.error));
      let text = String(r.output || "");
      if (a.filter) {
        try {
          const re = new RegExp(String(a.filter));
          text = text.split("\n").filter((l) => re.test(l)).join("\n");
        } catch {}
      }
      return ok(`status: ${r.running ? "running" : `exited (code ${r.exit_code})`}\n${clip(text || "(no output yet)")}`);
    },
  });

  tools.push({
    name: "KillShell",
    label: "KillShell",
    description: "Stops a background shell by its bash_id.",
    parameters: { type: "object", properties: { shell_id: { type: "string" } }, required: ["shell_id"] },
    run: async (a) => {
      let r: any;
      try {
        r = await ctx.sf("/api/jobs/kill", { id: a.shell_id });
      } catch (e: any) {
        return fail(`KillShell failed: ${e?.message || e} (unknown or expired shell_id?)`);
      }
      return r?.error ? fail(String(r.error)) : ok("Background shell stopped.");
    },
  });

  return tools;
}
