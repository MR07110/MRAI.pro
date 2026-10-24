"use client";

import { useEffect, useRef, useState } from "react";
import hljs from "highlight.js/lib/common";

// Map the language tags we see (from markdown fences, file extensions) to highlight.js language names.
const ALIAS: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript",
  sh: "bash", shell: "bash", zsh: "bash", fish: "bash", console: "bash",
  py: "python", rb: "ruby", rs: "rust", kt: "kotlin", kts: "kotlin",
  yml: "yaml", htm: "xml", html: "xml", svg: "xml", vue: "xml", xml: "xml",
  md: "markdown", markdown: "markdown",
  "c++": "cpp", cc: "cpp", hpp: "cpp", h: "cpp",
  golang: "go", jsonc: "json", text: "plaintext", txt: "plaintext",
};

// Highlighting a very large file would block the UI — plain text past this size.
const MAX_HIGHLIGHT = 200 * 1024;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightToHtml(code: string, language?: string): string {
  if (code.length > MAX_HIGHLIGHT) return escapeHtml(code);
  const raw = (language || "").toLowerCase().trim();
  const name = ALIAS[raw] || raw;
  try {
    if (name && name !== "plaintext" && hljs.getLanguage(name)) {
      return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
    }
    if (!name) return hljs.highlightAuto(code).value;
    return escapeHtml(code);
  } catch {
    return escapeHtml(code);
  }
}

// Syntax-highlighted code. The caller supplies the <pre> wrapper and its sizing/scroll.
// While the code is changing fast (streaming), it shows plain (escaped) text — cheap — and colorizes
// ~90ms after it settles, so a growing code block does not get re-tokenized on every frame.
export default function Highlight({ code, language, className = "" }: { code: string; language?: string; className?: string }) {
  const [html, setHtml] = useState(() => highlightToHtml(code, language));
  const [settled, setSettled] = useState(true);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return; // initial value already highlighted
    }
    setSettled(false);
    const id = setTimeout(() => {
      setHtml(highlightToHtml(code, language));
      setSettled(true);
    }, 90);
    return () => clearTimeout(id);
  }, [code, language]);

  return <code className={`hljs ${className}`} dangerouslySetInnerHTML={{ __html: settled ? html : escapeHtml(code) }} />;
}
