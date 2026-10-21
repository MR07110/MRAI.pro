"use client";

import { useState } from "react";

export default function LoginPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Kirib bo'lmadi");
    } catch {
      setError("Serverga ulanib bo'lmadi");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl text-neutral-100"
      >
        <h1 className="text-lg font-semibold mb-1">MR AI</h1>
        <p className="text-xs text-neutral-400 mb-5">Davom etish uchun kirish kalitini kiriting.</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Kirish kaliti"
          className="w-full px-3 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-sm outline-none focus:border-neutral-600"
        />
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        <button
          type="submit"
          disabled={loading || !key.trim()}
          className="w-full mt-4 px-3 py-2.5 rounded-lg bg-white text-neutral-950 text-sm font-semibold hover:bg-neutral-200 disabled:opacity-50 transition cursor-pointer"
        >
          {loading ? "Tekshirilmoqda..." : "Kirish"}
        </button>
      </form>
    </div>
  );
}
