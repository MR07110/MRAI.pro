"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Play } from "lucide-react";
import Highlight from "./Highlight";

export default function CodeBlock({ language, value }: { language?: string; value: string }) {
 const [copied, setCopied] = useState(false);
 const [serverUrl, setServerUrl] = useState("");
 const [running, setRunning] = useState(false);
 const [runResult, setRunResult] = useState<{ stdout: string; stderr: string; exit_code: number } | null>(null);

 const lang = (language || "").toLowerCase().trim();
 const isBash = ["bash", "sh", "shell", "zsh"].includes(lang);

 useEffect(() => {
 if (typeof window !== "undefined") {
 const saved = localStorage.getItem("mrai_server_url");
 if (saved && !saved.includes("trycloudflare.com")) setServerUrl(saved);
 }
 }, []);

 const handleCopy = async () => {
 try {
 await navigator.clipboard.writeText(value);
 setCopied(true);
 setTimeout(() => setCopied(false), 1800);
 } catch {}
 };

 const handleExecuteOnServer = async () => {
 setRunning(true);
 setRunResult(null);
 const targetUrl = serverUrl; // empty -> the Next server uses the address from its env
 try {
 // The token never reaches the browser: the command goes through the Next proxy (/api/server/exec).
 const res = await fetch("/api/server/exec", {
 method: "POST",
 headers: { "Content-Type": "application/json", ...(targetUrl ? { "x-server-url": targetUrl } : {}) },
 body: JSON.stringify({ command: value }),
 });
 setRunResult(await res.json());
 } catch (err: any) {
 setRunResult({ stdout: "", stderr: "Could not connect to server: " + (err.message || "Error"), exit_code: 1 });
 } finally {
 setRunning(false);
 }
 };

 return (
 <div className="my-4 border border-white/20 bg-black overflow-hidden font-mono">
 <div className="flex items-center justify-between h-9 pl-3.5 pr-2 bg-white/[0.035] text-[12px] text-neutral-500">
 <span className="font-mono lowercase">{language || "text"}</span>
 <div className="flex items-center gap-1">
 {isBash && (
 <button
 onClick={handleExecuteOnServer}
 disabled={running}
 className="flex items-center gap-1.5 h-7 px-2 text-neutral-400 hover:text-emerald-400 hover:bg-white/[0.06] disabled:opacity-50 transition cursor-pointer"
 title="Run on server"
 >
 {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
 <span>Run</span>
 </button>
 )}
 <button
 onClick={handleCopy}
 className="flex items-center gap-1.5 h-7 px-2 text-neutral-400 hover:text-white hover:bg-white/[0.06] transition cursor-pointer"
 >
 {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
 <span>{copied ? "Copied" : "Copy"}</span>
 </button>
 </div>
 </div>
 <pre className="p-4 overflow-x-auto font-mono text-[13px] leading-6 m-0"><Highlight code={value} language={language} /></pre>

 {running && (
 <div className="border-t border-white/10 px-4 py-3 flex items-center gap-2 text-xs font-mono text-neutral-400">
 <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
 <span>Running…</span>
 </div>
 )}
 {runResult && (
 <div className="border-t border-white/10 px-4 py-3 font-mono text-xs space-y-2">
 <div className="flex items-center justify-between text-[11px]">
 <span className="text-neutral-500">Result</span>
 <span className={runResult.exit_code === 0 ? "text-emerald-400" : "text-red-400"}>exit {runResult.exit_code}</span>
 </div>
 {runResult.stdout && <pre className="m-0 text-neutral-200 whitespace-pre-wrap leading-relaxed">{runResult.stdout}</pre>}
 {runResult.stderr && <pre className="m-0 text-red-400 whitespace-pre-wrap leading-relaxed">{runResult.stderr}</pre>}
 {!runResult.stdout && !runResult.stderr && runResult.exit_code === 0 && (
 <div className="text-emerald-400/80 italic">Completed successfully.</div>
 )}
 </div>
 )}
 </div>
 );
}
