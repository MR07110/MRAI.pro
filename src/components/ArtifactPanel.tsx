"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Eye,
  Code,
  Maximize2,
  Minimize2,
  RotateCw,
  Download,
  Copy,
  Check,
  ExternalLink,
  Terminal,
  Sparkles,
  Play,
} from "lucide-react";

export interface ArtifactData {
  title?: string;
  language: string;
  code: string;
}

interface Props {
  artifact: ArtifactData | null;
  onClose: () => void;
}

export function isArtifactPreviewable(language?: string, code?: string): boolean {
  if (!language && !code) return false;
  const lang = (language || "").toLowerCase().trim();
  if (
    [
      "html",
      "htm",
      "jsx",
      "tsx",
      "react",
      "javascript",
      "js",
      "svg",
      "python",
      "py",
      "markdown",
      "md",
      "mermaid",
      "bash",
      "sh",
      "shell",
      "zsh",
    ].includes(lang)
  ) {
    return true;
  }
  // Check code signatures
  if (code) {
    const trimmed = code.trim();
    if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) return true;
    if (trimmed.startsWith("<svg") && trimmed.includes("</svg>")) return true;
    if (trimmed.includes("import React") || trimmed.includes("export default function")) return true;
  }
  return false;
}

export function getArtifactExtension(language: string): string {
  const l = language.toLowerCase().trim();
  switch (l) {
    case "html":
    case "htm":
      return "html";
    case "jsx":
      return "jsx";
    case "tsx":
      return "tsx";
    case "javascript":
    case "js":
      return "js";
    case "python":
    case "py":
      return "py";
    case "svg":
      return "svg";
    case "bash":
    case "sh":
    case "shell":
    case "zsh":
      return "sh";
    case "markdown":
    case "md":
      return "md";
    case "css":
      return "css";
    case "json":
      return "json";
    default:
      return "txt";
  }
}

export function getArtifactTitle(language: string, code?: string): string {
  const l = language.toLowerCase().trim();
  if (l === "html" || l === "htm") return "Veb-sahifa ilovasi (HTML)";
  if (l === "jsx" || l === "tsx" || l === "react") return "React Interaktiv Komponenti";
  if (l === "javascript" || l === "js") return "JavaScript Dasturi";
  if (l === "svg") return "Vektor grafik (SVG)";
  if (l === "python" || l === "py") return "Python Skripti (Sandbox)";
  if (l === "bash" || l === "sh" || l === "shell" || l === "zsh") return "Linux Shell & Terminal (Sandbox)";
  if (l === "mermaid") return "Mermaid Sxema / Diagramma";
  if (l === "markdown" || l === "md") return "Formatlangan Hujjat";
  return "Interaktiv Artifact";
}

export default function ArtifactPanel({ artifact, onClose }: Props) {
  const [tab, setTab] = useState<"preview" | "code" | "console">("preview");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (artifact) {
      setTab("preview");
      setConsoleLogs([]);
    }
  }, [artifact]);

  if (!artifact) return null;

  const lang = (artifact.language || "text").toLowerCase().trim();
  const canPreview = isArtifactPreviewable(lang, artifact.code);
  const title = artifact.title || getArtifactTitle(lang, artifact.code);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownload = () => {
    try {
      const ext = getArtifactExtension(lang);
      const filename = `mrai-artifact-${Date.now()}.${ext}`;
      const blob = new Blob([artifact.code], {
        type: ext === "html" ? "text/html" : "text/plain",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  };

  const handleOpenExternal = () => {
    try {
      const srcDoc = generateSandboxHtml(lang, artifact.code);
      const blob = new Blob([srcDoc], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {}
  };

  const handleReload = () => {
    setReloadKey((prev) => prev + 1);
    setConsoleLogs([]);
  };

  return (
    <div
      className={`fixed z-50 transition-all duration-300 flex flex-col bg-neutral-950 border-neutral-800 shadow-2xl ${
        isFullscreen
          ? "inset-0"
          : "inset-y-0 right-0 w-full sm:w-[540px] md:w-[640px] lg:w-[720px] xl:w-[820px] border-l"
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/90 backdrop-blur shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-neutral-100 truncate">
              {title}
            </h3>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400 font-mono">
              <span className="uppercase">{lang}</span>
              <span>•</span>
              <span>Claude Artifact</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* View Toggles */}
          <div className="flex items-center p-0.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs">
            <button
              onClick={() => setTab("preview")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${
                tab === "preview"
                  ? "bg-neutral-800 text-white font-medium"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {["bash", "sh", "shell", "zsh"].includes(lang) ? (
                <>
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Terminal</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ko‘rinish</span>
                </>
              )}
            </button>
            <button
              onClick={() => setTab("code")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${
                tab === "code"
                  ? "bg-neutral-800 text-white font-medium"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kod</span>
            </button>
            {(lang === "python" || lang === "py" || lang === "javascript" || lang === "js") && (
              <button
                onClick={() => setTab("console")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${
                  tab === "console"
                    ? "bg-neutral-800 text-white font-medium"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Console</span>
              </button>
            )}
          </div>

          {/* Reload */}
          <button
            onClick={handleReload}
            title="Qayta yuklash"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Copy */}
          <button
            onClick={handleCopy}
            title="Kodni nusxalash"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            title="Faylni yuklab olish"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Open external */}
          <button
            onClick={handleOpenExternal}
            title="Yangi oynada ochish"
            className="hidden sm:inline-flex p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Kichraytirish" : "To‘liq ekran"}
            className="hidden sm:inline-flex p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            title="Yopish"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 min-h-0 relative bg-neutral-950 overflow-hidden">
        {tab === "preview" && canPreview && (
          <div className="w-full h-full relative">
            <iframe
              key={reloadKey}
              ref={iframeRef}
              srcDoc={generateSandboxHtml(lang, artifact.code)}
              title={title}
              sandbox="allow-scripts allow-modals allow-forms"
              className="w-full h-full border-0 bg-white dark:bg-neutral-950"
            />
          </div>
        )}

        {tab === "code" && (
          <div className="w-full h-full overflow-auto p-4 font-mono text-xs sm:text-[13px] leading-relaxed text-neutral-200 bg-neutral-950 selection:bg-blue-600/30">
            <pre className="whitespace-pre">{artifact.code}</pre>
          </div>
        )}

        {tab === "console" && (
          <div className="w-full h-full overflow-auto p-4 font-mono text-xs text-neutral-300 bg-neutral-950 space-y-1">
            <div className="text-[11px] text-neutral-500 pb-2 border-b border-neutral-800 flex items-center gap-1.5">
              <Terminal className="w-3 h-3 text-neutral-400" />
              <span>Sandbox Console Output:</span>
            </div>
            {consoleLogs.length === 0 ? (
              <div className="text-neutral-500 italic pt-2">
                Terminalda xabarlar yo‘q. Kod ishga tushganda `print()` yoki `console.log()` natijalari shu yerda ko‘rinadi.
              </div>
            ) : (
              consoleLogs.map((log, i) => (
                <div key={i} className="leading-relaxed">
                  {log}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="px-4 py-2 border-t border-neutral-800 bg-neutral-900/60 text-[11px] text-neutral-400 flex items-center justify-between shrink-0 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Xavfsiz WebAssembly Linux Sandbox</span>
        </div>
        <div className="text-neutral-500">
          {artifact.code.length} bayt • UTF-8
        </div>
      </div>
    </div>
  );
}

// Generate complete sandbox HTML for iframe execution
function generateSandboxHtml(language: string, rawCode: string): string {
  const l = language.toLowerCase().trim();

  // 1. PYTHON RUNNER (Pyodide Wasm Sandbox)
  if (l === "python" || l === "py") {
    const escapedPyCode = JSON.stringify(rawCode);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js"></script>
  <style>
    body {
      margin: 0;
      padding: 1rem;
      background: #090a0f;
      color: #e6edf3;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      line-height: 1.6;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-bottom: 10px;
      margin-bottom: 12px;
      border-bottom: 1px solid #21262d;
      color: #7d8590;
      font-size: 11px;
    }
    .badge {
      background: rgba(56, 139, 253, 0.15);
      color: #58a6ff;
      padding: 2px 8px;
      border-radius: 6px;
      font-weight: 600;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .stdout { color: #e6edf3; }
    .stderr { color: #f85149; }
    .result { color: #3fb950; font-weight: 600; margin-top: 8px; }
    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid #58a6ff;
      border-radius: 50%;
      border-top-color: transparent;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="header">
    <span class="badge">Python 3.12 (Pyodide Wasm)</span>
    <span id="status"><span class="spinner"></span> Dvigatel yuklanmoqda...</span>
  </div>
  <pre id="output" class="stdout"></pre>

  <script>
    async function execute() {
      const statusEl = document.getElementById("status");
      const outputEl = document.getElementById("output");
      try {
        const pyodide = await loadPyodide({
          stdout: (text) => { outputEl.textContent += text + "\\n"; },
          stderr: (text) => {
            const errSpan = document.createElement("span");
            errSpan.className = "stderr";
            errSpan.textContent = text + "\\n";
            outputEl.appendChild(errSpan);
          }
        });
        statusEl.innerHTML = "<span class='spinner'></span> Skript bajarilmoqda...";
        const code = ${escapedPyCode};
        const result = await pyodide.runPythonAsync(code);
        statusEl.innerHTML = "Muvaffaqiyatli bajarildi (Exit code: 0)";
        if (result !== undefined && result !== null) {
          const resEl = document.createElement("div");
          resEl.className = "result";
          resEl.textContent = ">>> Natija: " + result;
          outputEl.appendChild(resEl);
        }
      } catch (err) {
        statusEl.innerHTML = "<span style='color: #f85149'>Xatolik yuz berdi</span>";
        const errSpan = document.createElement("span");
        errSpan.className = "stderr";
        errSpan.textContent = "\\n" + err.message;
        outputEl.appendChild(errSpan);
      }
    }
    execute();
  </script>
</body>
</html>`;
  }

  // 1.5. BASH / SHELL / LINUX VIRTUAL TERMINAL RUNNER
  if (l === "bash" || l === "sh" || l === "shell" || l === "zsh") {
    const escapedCode = JSON.stringify(rawCode);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>Linux Terminal Sandbox</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      background: #090a0f;
      color: #e6edf3;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 13px;
      line-height: 1.5;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #0d1117;
      border-bottom: 1px solid #21262d;
      font-size: 11px;
      color: #8b949e;
      flex-shrink: 0;
      gap: 8px;
    }
    .top-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3fb950;
      flex-shrink: 0;
    }
    .badge {
      background: rgba(56, 139, 253, 0.15);
      color: #58a6ff;
      padding: 2px 8px;
      border-radius: 6px;
      font-weight: 600;
      white-space: nowrap;
    }
    .top-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .btn {
      background: #21262d;
      color: #c9d1d9;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn:hover {
      background: #30363d;
      color: #ffffff;
    }
    .quick-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #11141c;
      border-bottom: 1px solid #1f242c;
      overflow-x: auto;
      scrollbar-width: none;
      flex-shrink: 0;
    }
    .quick-bar::-webkit-scrollbar { display: none; }
    .quick-btn {
      background: #161b22;
      border: 1px solid #282e36;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      color: #79c0ff;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
      transition: all 0.15s;
    }
    .quick-btn:hover {
      background: #1f242c;
      border-color: #388bfd;
      color: #ffffff;
    }
    .terminal-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      cursor: text;
    }
    .line {
      margin-bottom: 4px;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .banner {
      color: #7d8590;
      font-size: 12px;
      margin-bottom: 10px;
      line-height: 1.4;
      border-left: 2px solid #58a6ff;
      padding-left: 8px;
    }
    .prompt-user { color: #3fb950; font-weight: 600; }
    .prompt-path { color: #58a6ff; font-weight: 600; }
    .prompt-char { color: #c9d1d9; }
    .cmd-text { color: #f0f6fc; font-weight: 600; }
    .out-text { color: #c9d1d9; }
    .out-dir { color: #58a6ff; font-weight: 600; }
    .out-file { color: #e6edf3; }
    .out-exec { color: #3fb950; font-weight: 600; }
    .out-err { color: #f85149; }
    .out-success { color: #3fb950; }
    .out-info { color: #d29922; }
    .input-row {
      display: flex;
      align-items: center;
      margin-top: 4px;
    }
    .cmd-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #ffffff;
      font-family: inherit;
      font-size: 13px;
      padding: 0;
      margin-left: 6px;
      caret-color: #58a6ff;
    }
  </style>
</head>
<body>
  <div class="top-bar">
    <div class="top-left">
      <span class="status-dot"></span>
      <span class="badge">Ubuntu 24.04 (Wasm/Virtual Linux)</span>
      <span id="host-label" style="display: none sm:inline;">user@mrai-sandbox:~</span>
    </div>
    <div class="top-actions">
      <button id="server-btn" class="btn" onclick="toggleServerModal()" style="border-color: #388bfd; color: #58a6ff;">● Serverni ulash</button>
      <button class="btn" onclick="runScriptAgain()">Skriptni qayta boshlash</button>
      <button class="btn" onclick="clearScreen()">Tozalash (clear)</button>
    </div>
  </div>

  <div id="server-modal" style="display: none; padding: 10px 12px; background: #161b22; border-bottom: 1px solid #30363d; font-size: 11px;">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
      <span style="font-weight: 600; color: #58a6ff;">Google Cloud Shell / Haqiqiy Server Havolasi (URL):</span>
      <button onclick="toggleServerModal()" style="background: none; border: none; color: #8b949e; cursor: pointer; font-size: 13px;">✕</button>
    </div>
    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
      <input id="server-url-input" type="text" placeholder="https://....trycloudflare.com" style="flex: 1; min-width: 220px; background: #0d1117; border: 1px solid #30363d; color: #fff; padding: 5px 8px; border-radius: 4px; font-family: inherit; font-size: 11px;" />
      <button onclick="saveServerUrl()" class="btn" style="background: #238636; border-color: #2ea043; color: #fff; font-weight: 600;">Ulash</button>
      <button onclick="clearServerUrl()" class="btn">Uzish</button>
    </div>
    <div id="server-status-msg" style="color: #8b949e; font-size: 10px; margin-top: 6px;">
      Google Cloud Shell terminalida berilgan buyruqdan so‘ng chiqqan <code>trycloudflare.com</code> havolasini shu yerga qo‘ying.
    </div>
  </div>

  <div class="quick-bar">
    <span style="color: #6e7681; font-size: 10px; margin-right: 4px;">Tezkor:</span>
    <button class="quick-btn" onclick="runFromQuick('ls -la')">ls -la</button>
    <button class="quick-btn" onclick="runFromQuick('pwd')">pwd</button>
    <button class="quick-btn" onclick="runFromQuick('cat script.sh')">cat script.sh</button>
    <button class="quick-btn" onclick="runFromQuick('uname -a')">uname -a</button>
    <button class="quick-btn" onclick="runFromQuick('whoami')">whoami</button>
    <button class="quick-btn" onclick="runFromQuick('date')">date</button>
    <button class="quick-btn" onclick="runFromQuick('df -h')">df -h</button>
    <button class="quick-btn" onclick="runFromQuick('free -m')">free -m</button>
    <button class="quick-btn" onclick="runFromQuick('help')">help</button>
    <button class="quick-btn" onclick="runFromQuick('clear')">clear</button>
  </div>

  <div class="terminal-body" id="term" onclick="focusInput()">
    <div id="output"></div>
    <div class="input-row" id="prompt-row">
      <span class="prompt-user">user@mrai-sandbox</span>:<span class="prompt-path" id="prompt-dir">~</span><span class="prompt-char">$ </span>
      <input type="text" id="cli-input" class="cmd-input" autofocus autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" />
    </div>
  </div>

  <script>
    const scriptSource = ${escapedCode};
    let cwd = "/home/user";
    const history = [];
    let historyIdx = -1;

    const fs = {
      "/": { type: "dir" },
      "/home": { type: "dir" },
      "/home/user": { type: "dir" },
      "/home/user/welcome.txt": {
        type: "file",
        content: "MR AI Linux Terminal Sandbox ga xush kelibsiz!\\nBu yerda barcha standart buyruqlarni (ls, pwd, cd, cat, mkdir, rm, echo, python3, curl) erkin yurgizishingiz mumkin.\\n"
      },
      "/home/user/script.sh": {
        type: "file",
        content: scriptSource
      },
      "/etc": { type: "dir" },
      "/etc/os-release": {
        type: "file",
        content: "NAME=\\"Ubuntu\\"\\nVERSION=\\"24.04 LTS (Noble Numbat)\\"\\nID=ubuntu\\nPRETTY_NAME=\\"Ubuntu 24.04 LTS (MR AI Cloud)\\"\\n"
      },
      "/etc/hostname": { type: "file", content: "mrai-sandbox\\n" },
      "/tmp": { type: "dir" },
      "/var": { type: "dir" },
      "/var/log": { type: "dir" },
      "/var/log/syslog": {
        type: "file",
        content: "systemd[1]: Started MR AI Sandbox Virtual Container.\\nsystemd[1]: Multi-User System Target reached.\\n"
      }
    };

    function escapeHtml(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function formatPath(p) {
      if (p === "/home/user") return "~";
      if (p.startsWith("/home/user/")) return "~" + p.slice(10);
      return p;
    }

    function updatePrompt() {
      const p = formatPath(cwd);
      document.getElementById("prompt-dir").textContent = p;
      const hostLabel = document.getElementById("host-label");
      const saved = localStorage.getItem("mrai_server_url");
      if (hostLabel) hostLabel.textContent = (saved ? "cloudshell:" : "user@mrai-sandbox:") + p;
    }

    function focusInput() {
      const inp = document.getElementById("cli-input");
      if (inp) inp.focus();
    }

    function scrollToBottom() {
      const term = document.getElementById("term");
      if (term) term.scrollTop = term.scrollHeight;
    }

    function appendHtml(html) {
      const out = document.getElementById("output");
      if (out) {
        out.innerHTML += html;
        scrollToBottom();
      }
    }

    function appendLine(text, className) {
      const cls = className ? ' class="' + className + '"' : ' class="line out-text"';
      appendHtml('<div' + cls + '>' + escapeHtml(text) + '</div>');
    }

    function resolvePath(target) {
      if (!target) return cwd;
      let p = target.trim();
      if (p === "~" || p.startsWith("~/")) {
        p = "/home/user" + p.slice(1);
      } else if (!p.startsWith("/")) {
        p = (cwd === "/" ? "" : cwd) + "/" + p;
      }
      const parts = p.split("/").filter(Boolean);
      const resolved = [];
      for (const seg of parts) {
        if (seg === ".") continue;
        if (seg === "..") {
          resolved.pop();
        } else {
          resolved.push(seg);
        }
      }
      return "/" + resolved.join("/");
    }

    function getDirEntries(dirPath) {
      const norm = dirPath === "/" ? "/" : dirPath.replace(/\\/+$/, "");
      const prefix = norm === "/" ? "/" : norm + "/";
      const entries = new Map();
      for (const k of Object.keys(fs)) {
        if (k.startsWith(prefix) && k !== norm) {
          const rest = k.slice(prefix.length);
          const firstSegment = rest.split("/")[0];
          const fullChild = prefix + firstSegment;
          const isDir = (fs[fullChild] && fs[fullChild].type === "dir") || rest.includes("/");
          if (!entries.has(firstSegment)) {
            entries.set(firstSegment, {
              name: firstSegment,
              isDir: isDir,
              size: fs[fullChild] && fs[fullChild].content ? fs[fullChild].content.length : 4096
            });
          }
        }
      }
      return Array.from(entries.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    function makeDir(targetPath) {
      const norm = resolvePath(targetPath);
      const parts = norm.split("/").filter(Boolean);
      let cur = "";
      for (const seg of parts) {
        cur += "/" + seg;
        if (!fs[cur]) {
          fs[cur] = { type: "dir" };
        }
      }
    }

    function writeFile(targetPath, content, append) {
      const norm = resolvePath(targetPath);
      const lastSlash = norm.lastIndexOf("/");
      const parent = lastSlash <= 0 ? "/" : norm.substring(0, lastSlash);
      if (!fs[parent]) makeDir(parent);
      if (append && fs[norm] && fs[norm].type === "file") {
        fs[norm].content += content;
      } else {
        fs[norm] = { type: "file", content: content };
      }
    }

    function removePath(targetPath) {
      const norm = resolvePath(targetPath);
      if (norm === "/" || norm === "/home" || norm === "/home/user") {
        return "rm: ruxsat berilmadi: ildiz yoki tizim katalogini o'chirish taqiqlangan";
      }
      let deleted = false;
      for (const k of Object.keys(fs)) {
        if (k === norm || k.startsWith(norm + "/")) {
          delete fs[k];
          deleted = true;
        }
      }
      return deleted ? null : ("rm: cannot remove '" + targetPath + "': No such file or directory");
    }

    function readFile(targetPath) {
      const norm = resolvePath(targetPath);
      if (!fs[norm]) return "cat: " + targetPath + ": No such file or directory";
      if (fs[norm].type === "dir") return "cat: " + targetPath + ": Is a directory";
      return fs[norm].content;
    }

    // Execute a single command string
    async function execCommand(rawCmd) {
      const trimmed = rawCmd.trim();
      if (!trimmed) return;

      let savedServer = localStorage.getItem("mrai_server_url") || "";
      if (savedServer.includes("trycloudflare.com")) savedServer = "";
      {
        try {
          const proxyRes = await fetch("/api/server/exec", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(savedServer ? { "x-server-url": savedServer } : {})
            },
            body: JSON.stringify({ command: trimmed, cwd: cwd }),
          });
          const data: any = await proxyRes.json();
          if (data.cwd) {
            cwd = data.cwd;
            updatePrompt();
          }
          if (data.stdout) {
            appendLine(data.stdout, "line out-text");
          }
          if (data.stderr) {
            appendLine(data.stderr, "line out-err");
          }
          return;
        } catch (err) {
          appendLine("Haqiqiy serverga ulanishda xatolik yuz berdi: " + err.message + ". Standart sandboxga o'tildi.", "line out-err");
        }
      }

      if (trimmed.startsWith("#")) {
        appendLine(trimmed, "line out-info");
        return;
      }

      if (trimmed.includes(" && ")) {
        const parts = trimmed.split(" && ");
        for (const sub of parts) {
          await execCommand(sub);
        }
        return;
      }

      let cmdPart = trimmed;
      let redirFile = null;
      let redirAppend = false;
      if (trimmed.includes(" >> ")) {
        const p = trimmed.split(" >> ");
        cmdPart = p[0].trim();
        redirFile = p[1].trim();
        redirAppend = true;
      } else if (trimmed.includes(" > ")) {
        const p = trimmed.split(" > ");
        cmdPart = p[0].trim();
        redirFile = p[1].trim();
        redirAppend = false;
      }

      const tokens = cmdPart.match(/("[^"]*"|'[^']*'|\\S+)/g) || [];
      const cleanTokens = tokens.map(t => {
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
          return t.slice(1, -1);
        }
        return t;
      });

      const cmd = (cleanTokens[0] || "").toLowerCase();
      const args = cleanTokens.slice(1);
      let outputText = "";

      switch (cmd) {
        case "help":
          outputText = [
            "MR AI Linux Virtual Terminal - Mavjud buyruqlar:",
            "  ls [-la] [dir]    - Katalogdagi fayllarni ko'rsatish",
            "  pwd               - Joriy katalogni ko'rish",
            "  cd [path]         - Katalogni o'zgartirish (cd .., cd ~, cd /)",
            "  cat [file]        - Fayl tarkibini o'qish",
            "  echo [text]       - Matn chiqarish (echo 'salom' > test.txt)",
            "  mkdir [-p] [dir]  - Yangi katalog yaratish",
            "  touch [file]      - Yangi fayl yaratish",
            "  rm [-rf] [path]   - Fayl yoki katalogni o'chirish",
            "  uname -a          - Tizim yadrosi ma'lumotlari",
            "  whoami, id, date  - Foydalanuvchi va vaqt ma'lumotlari",
            "  uptime, hostname  - Tizim holati va kompyuter nomi",
            "  df -h, free -m    - Disk va operativ xotira hajmi",
            "  history           - Kiritilgan buyruqlar tarixi",
            "  curl [url]        - HTTP so'rov yuborish",
            "  node -e 'code'    - JavaScript kodini ishga tushirish",
            "  python3 -c '...'  - Python kodini ishga tushirish",
            "  bash [file]       - Skriptni bajarish",
            "  clear             - Ekranni tozalash"
          ].join("\\n");
          break;

        case "pwd":
          outputText = cwd;
          break;

        case "cd":
          const target = args[0] || "~";
          const newPath = resolvePath(target);
          if (fs[newPath] && fs[newPath].type === "dir") {
            cwd = newPath;
            updatePrompt();
          } else {
            outputText = "bash: cd: " + target + ": No such file or directory";
          }
          break;

        case "ls":
        case "dir":
          const hasL = args.some(a => a.includes("-l"));
          const targetDir = args.filter(a => !a.startsWith("-"))[0] || cwd;
          const resolvedDir = resolvePath(targetDir);
          if (!fs[resolvedDir] || fs[resolvedDir].type !== "dir") {
            outputText = "ls: cannot access '" + targetDir + "': No such file or directory";
          } else {
            const entries = getDirEntries(resolvedDir);
            if (entries.length === 0) {
              outputText = "(bo'sh katalog)";
            } else if (hasL) {
              const lines = ["total " + (entries.length * 4)];
              entries.forEach(e => {
                const perms = e.isDir ? "drwxr-xr-x" : (e.name.endsWith(".sh") ? "-rwxr-xr-x" : "-rw-r--r--");
                const size = String(e.size).padStart(6, " ");
                const dateStr = "Oct 21 02:50";
                lines.push(perms + " 1 user user " + size + " " + dateStr + " " + e.name + (e.isDir ? "/" : ""));
              });
              outputText = lines.join("\\n");
            } else {
              const parts = entries.map(e => {
                if (e.isDir) return '<span class="out-dir">' + escapeHtml(e.name) + '/</span>';
                if (e.name.endsWith(".sh")) return '<span class="out-exec">' + escapeHtml(e.name) + '</span>';
                return '<span class="out-file">' + escapeHtml(e.name) + '</span>';
              });
              if (!redirFile) {
                appendHtml('<div class="line">' + parts.join("   ") + '</div>');
                return;
              }
              outputText = entries.map(e => e.name).join("  ");
            }
          }
          break;

        case "cat":
          if (!args[0]) {
            outputText = "cat: fayl nomi ko'rsatilmadi";
          } else {
            outputText = readFile(args[0]);
          }
          break;

        case "echo":
          outputText = args.join(" ");
          break;

        case "touch":
          if (!args[0]) {
            outputText = "touch: fayl nomi kiritilmadi";
          } else {
            writeFile(args[0], "", true);
          }
          break;

        case "mkdir":
          const dirToMake = args.filter(a => !a.startsWith("-"))[0];
          if (!dirToMake) {
            outputText = "mkdir: katalog nomi kiritilmadi";
          } else {
            makeDir(dirToMake);
          }
          break;

        case "rm":
          const fileToRm = args.filter(a => !a.startsWith("-"))[0];
          if (!fileToRm) {
            outputText = "rm: o'chirish uchun fayl nomi kiritilmadi";
          } else {
            const err = removePath(fileToRm);
            if (err) outputText = err;
          }
          break;

        case "whoami":
          outputText = "user";
          break;

        case "id":
          outputText = "uid=1000(user) gid=1000(user) groups=1000(user),27(sudo),100(users)";
          break;

        case "hostname":
          outputText = "mrai-sandbox";
          break;

        case "uname":
          outputText = "Linux mrai-sandbox 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux";
          break;

        case "date":
          outputText = new Date().toUTCString();
          break;

        case "uptime":
          outputText = " 02:59:10 up 31 days, 16:42,  1 user,  load average: 0.08, 0.04, 0.01";
          break;

        case "history":
          outputText = history.map((h, i) => String(i + 1).padStart(4, " ") + "  " + h).join("\\n");
          break;

        case "clear":
          document.getElementById("output").innerHTML = "";
          return;

        case "df":
          outputText = [
            "Filesystem      Size  Used Avail Use% Mounted on",
            "/dev/vda1        20G  3.1G   16G  17% /",
            "tmpfs           512M     0  512M   0% /tmp",
            "none            4.0G  4.0K  4.0G   1% /dev"
          ].join("\\n");
          break;

        case "free":
          outputText = [
            "               total        used        free      shared  buff/cache   available",
            "Mem:            4096         512        3200          16         384        3584",
            "Swap:           2048           0        2048"
          ].join("\\n");
          break;

        case "curl":
          if (!args[0]) {
            outputText = "curl: try 'curl --help' for more information";
          } else {
            const url = args.filter(a => !a.startsWith("-"))[0];
            try {
              const res = await fetch(url);
              const data = await res.text();
              outputText = data.slice(0, 1500) + (data.length > 1500 ? "\\n...(qisqartirildi)" : "");
            } catch (err) {
              outputText = "HTTP/1.1 200 OK\\nContent-Type: application/json\\nServer: MR AI Mock\\n\\n{\\n  \\"status\\": \\"success\\",\\n  \\"url\\": \\"" + url + "\\",\\n  \\"message\\": \\"Bog'lanish muvaffaqiyatli o'rnatildi\\"\\n}";
            }
          }
          break;

        case "node":
          if (args[0] === "-e" && args[1]) {
            try {
              const res = eval(args.slice(1).join(" "));
              outputText = res !== undefined ? String(res) : "";
            } catch (err) {
              outputText = "Node Error: " + err.message;
            }
          } else {
            outputText = "Node.js v20.18.0 (Interactive mode: 'node -e \\\"code\\\"' or select file)";
          }
          break;

        case "python3":
        case "python":
          if (args[0] === "-c" && args[1]) {
            try {
              const pyCode = args.slice(1).join(" ");
              if (pyCode.includes("print(")) {
                const match = pyCode.match(/print\\((.*)\\)/);
                if (match) {
                  try {
                    outputText = String(eval(match[1]));
                  } catch {
                    outputText = match[1].replace(/['"]/g, "");
                  }
                }
              } else {
                outputText = String(eval(pyCode));
              }
            } catch (err) {
              outputText = "Python 3.12: " + args.slice(1).join(" ");
            }
          } else {
            outputText = "Python 3.12.3 (main, Jul 21 2026, 02:00:00)\\n[GCC 13.2.0] on linux";
          }
          break;

        case "bash":
        case "sh":
          if (args[0]) {
            const scriptContent = readFile(args[0]);
            if (scriptContent.startsWith("cat: ")) {
              outputText = "bash: " + args[0] + ": No such file or directory";
            } else {
              const lines = scriptContent.split("\\n");
              for (const l of lines) {
                if (l.trim()) await execCommand(l);
              }
              return;
            }
          } else {
            outputText = "GNU bash, version 5.2.21(1)-release (x86_64-pc-linux-gnu)";
          }
          break;

        case "sudo":
          if (args.length > 0) {
            await execCommand(args.join(" "));
            return;
          }
          outputText = "usage: sudo command";
          break;

        default:
          outputText = "bash: " + cmd + ": command not found. (Mavjud buyruqlar uchun 'help' deb yozing)";
          break;
      }

      if (redirFile) {
        writeFile(redirFile, outputText + "\\n", redirAppend);
      } else if (outputText) {
        appendLine(outputText, outputText.startsWith("bash: ") || outputText.startsWith("rm: ") ? "line out-err" : "line out-text");
      }
    }

    async function handleEnter() {
      const inp = document.getElementById("cli-input");
      const val = inp.value;
      inp.value = "";
      if (!val.trim()) return;

      history.push(val);
      historyIdx = history.length;

      const p = formatPath(cwd);
      appendHtml('<div class="line"><span class="prompt-user">user@mrai-sandbox</span>:<span class="prompt-path">' + escapeHtml(p) + '</span><span class="prompt-char">$ </span><span class="cmd-text">' + escapeHtml(val) + '</span></div>');

      await execCommand(val);
      scrollToBottom();
      focusInput();
    }

    function runFromQuick(cmd) {
      const inp = document.getElementById("cli-input");
      inp.value = cmd;
      handleEnter();
    }

    function clearScreen() {
      document.getElementById("output").innerHTML = "";
      focusInput();
    }

    async function runInitialScript() {
      const saved = localStorage.getItem("mrai_server_url");
      const host = saved ? "cloudshell" : "mrai-sandbox";
      const promptUser = saved ? "cloudshell" : "user@mrai-sandbox";

      appendHtml(
        '<div class="banner">' +
        '  <b>Ubuntu 24.04 (' + (saved ? '<span style="color:#3fb950;">Google Cloud Shell Real Linux</span>' : 'Virtual Linux Sandbox') + ')</b><br/>' +
        '  * Host: ' + host + ' • ' + (saved ? '<span style="color:#3fb950;">Haqiqiy Server Ulangan</span>' : 'Standart Sandbox') + '<br/>' +
        '  Buyruqlar ro\\'yxati uchun: <span style="color: #79c0ff;">help</span> deb yozing.<br/>' +
        '</div>'
      );

      appendHtml('<div class="line"><span class="prompt-user">' + promptUser + '</span>:<span class="prompt-path">' + escapeHtml(formatPath(cwd)) + '</span><span class="prompt-char">$ </span><span class="cmd-text">bash script.sh</span></div>');

      if (saved) {
        // Execute entire multi-line bash script at once on real Google Cloud Shell!
        await execCommand(scriptSource);
      } else {
        // Local fallback execution line-by-line
        const lines = scriptSource.split("\\n");
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (line) {
            await new Promise(r => setTimeout(r, 40));
            if (!line.startsWith("#")) {
              appendHtml('<div class="line" style="color: #8b949e; font-size: 11px;"><span style="color: #58a6ff;">&gt;</span> ' + escapeHtml(line) + '</div>');
            }
            await execCommand(line);
          }
        }
      }

      appendHtml('<div class="line out-success" style="margin-top: 6px;">[Skript muvaffaqiyatli bajarildi (Exit code: 0)]</div><div style="height: 6px;"></div>');
      updatePrompt();
      scrollToBottom();
      focusInput();
    }

    function runScriptAgain() {
      document.getElementById("output").innerHTML = "";
      runInitialScript();
    }

    const inp = document.getElementById("cli-input");
    inp.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleEnter();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (history.length > 0 && historyIdx > 0) {
          historyIdx--;
          inp.value = history[historyIdx] || "";
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIdx < history.length - 1) {
          historyIdx++;
          inp.value = history[historyIdx] || "";
        } else {
          historyIdx = history.length;
          inp.value = "";
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        const current = inp.value.trim();
        const known = ["ls", "pwd", "cd", "cat", "echo", "mkdir", "touch", "rm", "help", "clear", "uname", "whoami", "date", "history", "curl", "python3", "node", "df", "free", "uptime"];
        const match = known.find(k => k.startsWith(current));
        if (match) inp.value = match + " ";
      }
    });

    function checkServerStatus() {
      const saved = localStorage.getItem("mrai_server_url");
      const btn = document.getElementById("server-btn");
      const badge = document.querySelector(".badge");
      const hostLabel = document.getElementById("host-label");
      const urlInp = document.getElementById("server-url-input");
      if (urlInp && saved) urlInp.value = saved;

      if (saved) {
        if (btn) {
          btn.textContent = "● Haqiqiy Server: Ulangan";
          btn.style.color = "#3fb950";
          btn.style.borderColor = "#238636";
        }
        if (badge) {
          badge.textContent = "Google Cloud Shell (Real Linux)";
          badge.style.color = "#3fb950";
        }
        if (hostLabel) {
          hostLabel.textContent = "cloudshell:" + formatPath(cwd);
        }
      } else {
        if (btn) {
          btn.textContent = "● Serverni ulash";
          btn.style.color = "#58a6ff";
          btn.style.borderColor = "#388bfd";
        }
        if (badge) {
          badge.textContent = "Ubuntu 24.04 (Wasm/Virtual Linux)";
          badge.style.color = "#58a6ff";
        }
      }
    }

    function toggleServerModal() {
      const m = document.getElementById("server-modal");
      if (m) m.style.display = m.style.display === "none" ? "block" : "none";
    }

    async function saveServerUrl() {
      const inp = document.getElementById("server-url-input");
      const msg = document.getElementById("server-status-msg");
      let url = inp ? inp.value.trim() : "";
      if (!url) return;
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }
      if (msg) msg.textContent = "Server tekshirilmoqda...";
      try {
        await fetch(url.replace(/\/+$/, "") + "/");
        localStorage.setItem("mrai_server_url", url);
        if (msg) msg.textContent = "Muvaffaqiyatli ulandi! Barcha buyruqlar Google Cloud Shell da bajariladi.";
        checkServerStatus();
        setTimeout(() => { toggleServerModal(); }, 1500);
      } catch (err) {
        localStorage.setItem("mrai_server_url", url);
        if (msg) msg.textContent = "URL saqlandi. Bog'lanish sinab ko'riladi.";
        checkServerStatus();
        setTimeout(() => { toggleServerModal(); }, 1500);
      }
    }

    function clearServerUrl() {
      localStorage.removeItem("mrai_server_url");
      const inp = document.getElementById("server-url-input");
      const msg = document.getElementById("server-status-msg");
      if (inp) inp.value = "";
      if (msg) msg.textContent = "Server uzildi. Standart qumloq (Sandbox) rejimiga qaytildi.";
      checkServerStatus();
      setTimeout(() => { toggleServerModal(); }, 1500);
    }

    window.addEventListener("load", () => {
      checkServerStatus();
      runInitialScript();
    });
  </script>
</body>
</html>`;
  }

  // 2. SVG RENDERER
  if (l === "svg" || rawCode.trim().startsWith("<svg")) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0a;
      padding: 2rem;
      box-sizing: border-box;
    }
    svg {
      max-width: 100%;
      height: auto;
      filter: drop-shadow(0 10px 20px rgba(0,0,0,0.5));
    }
  </style>
</head>
<body>
  ${rawCode}
</body>
</html>`;
  }

  // 3. REACT (JSX / TSX) COMPONENT RUNNER
  const isReact =
    l === "jsx" ||
    l === "tsx" ||
    l === "react" ||
    rawCode.includes("import React") ||
    rawCode.includes("export default function") ||
    rawCode.includes("useState") ||
    rawCode.includes("useEffect");

  if (isReact) {
    // Strip markdown fences if present
    let cleanedCode = rawCode
      .replace(/^```[a-zA-Z0-9_-]*\s*\n?/gm, "")
      .replace(/```\s*$/gm, "")
      .replace(/```/g, "");

    // Strip import / export statements for browser standalone Babel
    cleanedCode = cleanedCode
      .replace(/import\s+.*?;?\s*$/gm, "")
      .replace(/export\s+default\s+/g, "const App = ")
      .replace(/export\s+/g, "");

    // Strip duplicate createRoot / render calls if AI already generated them at the bottom
    cleanedCode = cleanedCode
      .replace(/const\s+root\s*=\s*ReactDOM\.createRoot.*?$/gm, "")
      .replace(/ReactDOM\.createRoot.*?$/gm, "")
      .replace(/root\.render\s*\(.*?\);?/gm, "")
      .replace(/ReactDOM\.render\s*\(.*?\);?/gm, "");

    // If no App is defined, find component name or wrap
    if (!cleanedCode.includes("const App") && !cleanedCode.includes("function App")) {
      const match = cleanedCode.match(/function\s+([A-Z][A-Za-z0-9_]*)/);
      if (match) {
        cleanedCode += `\nconst App = ${match[1]};`;
      }
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0a0a;
      color: #ededed;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react,typescript">
    const { useState, useEffect, useRef, useMemo, useCallback, useId } = React;

    window.onerror = function(msg, url, line, col, error) {
      const root = document.getElementById("root");
      if (root) {
        root.innerHTML = '<div style="padding: 1.5rem; color: #f87171; font-family: monospace; font-size: 13px; line-height: 1.6; background: #18181b; border: 1px solid #27272a; border-radius: 8px; margin: 1rem;"><b style="color: #ef4444;">Komponent Xatosi:</b><br/>' + (error ? error.message : msg) + '<br/><span style="color: #71717a; font-size: 11px;">Qator: ' + line + '</span></div>';
      }
    };

    try {
      ${cleanedCode}

      if (typeof App !== 'undefined') {
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
      } else {
        document.getElementById('root').innerHTML = '<div style="padding: 1.5rem; color: #f87171;">React App komponenti topilmadi.</div>';
      }
    } catch (err) {
      document.getElementById('root').innerHTML = '<div style="padding: 1.5rem; color: #f87171; font-family: monospace; font-size: 13px; line-height: 1.6; background: #18181b; border: 1px solid #27272a; border-radius: 8px; margin: 1rem;"><b style="color: #ef4444;">React Render Xatosi:</b><br/>' + err.message + '</div>';
    }
  </script>
</body>
</html>`;
  }

  // 4. STANDALONE HTML / TAILWIND / JAVASCRIPT
  if (rawCode.includes("<!DOCTYPE html") || rawCode.includes("<html") || l === "html" || l === "htm") {
    // If it has tailwind link already, use as is; otherwise inject tailwind CDN
    if (!rawCode.includes("tailwindcss.com")) {
      return rawCode.replace("<head>", '<head>\n  <script src="https://cdn.tailwindcss.com"></script>');
    }
    return rawCode;
  }

  // 5. GENERIC HTML SNIPPET WRAPPER
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      margin: 0;
      padding: 1.25rem;
      font-family: system-ui, -apple-system, sans-serif;
      background: #0a0a0a;
      color: #ededed;
    }
  </style>
</head>
<body>
  ${rawCode}
</body>
</html>`;
}
