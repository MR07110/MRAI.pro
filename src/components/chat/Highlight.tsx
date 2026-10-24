"use client";

import { useMemo } from "react";
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
export default function Highlight({ code, language, className = "" }: { code: string; language?: string; className?: string }) {
  const html = useMemo(() => highlightToHtml(code, language), [code, language]);
  return <code className={`hljs ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
