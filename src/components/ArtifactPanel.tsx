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
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ko‘rinish</span>
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
