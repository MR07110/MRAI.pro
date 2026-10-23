"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, KeyRound, Loader2 } from "lucide-react";

type Step = "loading" | "key" | "account";

// Faqat o'z suhbat manzillariga qaytariladi (open-redirect yo'q).
function nextUrl(): string {
  try {
    const n = new URLSearchParams(window.location.search).get("next") || "";
    return /^\/c\/[A-Za-z0-9_-]{8,64}$/.test(n) ? n : "/";
  } catch {
    return "/";
  }
}
type Mode = "signin" | "register";

const inputCls =
  "w-full h-11 px-3.5 rounded-xl border border-white/10 bg-[#0c0c0c] text-neutral-100 placeholder:text-neutral-600 text-sm focus:border-white/25 focus:outline-none transition";
const labelCls = "block text-[13px] font-medium text-neutral-300 mb-1.5";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function LoginPage() {
  const [step, setStep] = useState<Step>("loading");
  const [mode, setMode] = useState<Mode>("signin");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.access && d?.user) {
          window.location.replace(nextUrl());
          return;
        }
        setStep(d?.access ? "account" : "key");
      })
      .catch(() => setStep("key"));
  }, []);

  async function submitKey(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const { ok, data } = await post("/api/auth/access", { key });
      if (ok) {
        setKey("");
        setStep("account");
      } else setError(data?.error || "Kirib bo'lmadi");
    } catch {
      setError("Serverga ulanib bo'lmadi");
    }
    setBusy(false);
  }

  async function submitAccount(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const reg = mode === "register";
    if (reg) {
      if (!name.trim()) return setError("Ismingizni kiriting");
      if (username.trim().length < 3) return setError("Username kamida 3 ta belgi bo'lishi kerak");
      if (password.length < 6) return setError("Parol kamida 6 ta belgi bo'lishi kerak");
      if (password !== confirm) return setError("Parollar mos kelmadi");
    } else if (!username.trim() || !password) {
      return setError("Username va parolni kiriting");
    }
    setBusy(true);
    try {
      const { ok, data } = await post(reg ? "/api/auth/register" : "/api/auth/signin", {
        name,
        username,
        password,
      });
      if (ok) {
        window.location.href = nextUrl();
        return;
      }
      if (data?.error === "Enter your access key first") setStep("key");
      setError(data?.error || "Errorlik yuz berdi");
    } catch {
      setError("Serverga ulanib bo'lmadi");
    }
    setBusy(false);
  }

  async function changeKey() {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {}
    setError("");
    setStep("key");
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setPassword("");
    setConfirm("");
  }

  const primaryBtn =
    "w-full h-11 mt-2 rounded-xl bg-white text-black text-sm font-medium hover:bg-neutral-200 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-2";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-black text-neutral-100">
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[380px]">
          <div className="flex flex-col items-center mb-8">
            <Image src="/logo-white.png" alt="MR AI" width={38} height={38} />
            <h1 className="mt-4 text-[26px] font-medium tracking-tight">MR AI</h1>
          </div>

          {step === "loading" && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
            </div>
          )}

          {step === "key" && (
            <form onSubmit={submitKey} className="space-y-3">
              <p className="text-center text-sm text-neutral-400 mb-5">Enter your access key to continue</p>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-600" />
                <input
                  type="password"
                  autoFocus
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Access key"
                  className={inputCls + " pl-10"}
                />
              </div>
              {error && <p className="text-[13px] text-red-400 bg-red-500/[0.07] border border-red-500/20 px-3.5 py-2.5 rounded-xl">{error}</p>}
              <button type="submit" disabled={busy || !key.trim()} className={primaryBtn}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Davom etish <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          {step === "account" && (
            <form onSubmit={submitAccount} className="space-y-3">
              <div className="grid grid-cols-2 p-1 rounded-xl bg-white/[0.05] mb-5">
                {(["signin", "register"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={`h-9 rounded-lg text-[13.5px] font-medium transition cursor-pointer ${
                      mode === m ? "bg-white text-black" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    {m === "signin" ? "Kirish" : "Ro'yxatdan o'tish"}
                  </button>
                ))}
              </div>

              {mode === "register" && (
                <div>
                  <label className={labelCls}>Ism</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ismingiz" className={inputCls} autoFocus />
                </div>
              )}

              <div>
                <label className={labelCls}>Username</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                  placeholder="foydalanuvchi_nomi"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  autoFocus={mode === "signin"}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Parol</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  className={inputCls}
                />
              </div>

              {mode === "register" && (
                <div>
                  <label className={labelCls}>Parolni takrorlang</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className={inputCls}
                  />
                </div>
              )}

              {error && <p className="text-[13px] text-red-400 bg-red-500/[0.07] border border-red-500/20 px-3.5 py-2.5 rounded-xl">{error}</p>}

              <button type="submit" disabled={busy} className={primaryBtn}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "signin" ? "Kirish" : "Hisob yaratish"}
              </button>

              <button type="button" onClick={changeKey} className="w-full pt-3 text-xs text-neutral-600 hover:text-neutral-300 transition cursor-pointer">
                Access keyni qayta kiritish
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
