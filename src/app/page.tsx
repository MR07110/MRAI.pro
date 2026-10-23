"use client";

import { useState } from "react";
import Image from "next/image";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ChatApp from "@/components/ChatApp";

function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setName("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isLogin) {
      if (!name.trim()) {
        setError("Iltimos, ismingizni kiriting");
        return;
      }
      if (!username.trim()) {
        setError("Iltimos, username kiriting");
        return;
      }
      if (username.trim().length < 3) {
        setError("Username kamida 3 ta belgidan iborat bo‘lishi kerak");
        return;
      }
      if (password.length < 6) {
        setError("Parol kamida 6 ta belgidan iborat bo‘lishi kerak");
        return;
      }
      if (password !== confirmPassword) {
        setError("Parollar mos kelmadi. Iltimos, parolni to‘g‘ri takrorlang");
        return;
      }
    } else {
      if (!username.trim() || !password) {
        setError("Username va parolni kiriting");
        return;
      }
    }

    setLoading(true);

    if (isLogin) {
      const result = await signIn(username, password);
      if (result.error) {
        if (result.error.toLowerCase().includes("invalid login credentials")) {
          setError("Username yoki parol noto‘g‘ri");
        } else {
          setError(result.error);
        }
      }
    } else {
      const result = await signUp(name, username, password);
      if (result.error) {
        if (
          result.error.toLowerCase().includes("already registered") ||
          result.error.toLowerCase().includes("user already exists")
        ) {
          setError("Bu username allaqachon band. Boshqa username tanlang yoki Kirish bo‘limidan kiring.");
        } else if (
          result.error.includes("rate limit") ||
          result.error.includes("security purposes")
        ) {
          setError("Xavfsizlik yuzasidan 1 daqiqa kuting yoki to‘g‘ridan-to‘g‘ri 'Kirish' bo‘limidan urinib ko‘ring.");
        } else {
          setError(result.error);
        }
      }
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col bg-black text-neutral-100">
      <header className="h-14 border-b border-neutral-800 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Image src="/logo-white.png" alt="MR AI" width={28} height={28} />
          <span className="font-semibold text-[15px] tracking-tight text-neutral-100">
            MR AI
          </span>
        </div>
        <div className="text-sm text-neutral-400">Professional AI Assistant</div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 mb-4 shadow-inner">
              <Image src="/logo-white.png" alt="MR AI" width={32} height={32} />
            </div>
            <h1 className="text-2xl font-semibold text-neutral-100 tracking-tight">
              {isLogin ? "Xush kelibsiz" : "Ro‘yxatdan o‘tish"}
            </h1>
            <p className="mt-1.5 text-sm text-neutral-400">
              {isLogin ? "Hisobingizga kiring" : "Yangi hisob yarating"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                  Ism
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ismingiz"
                  required={!isLogin}
                  className="w-full h-11 px-3.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500 text-sm focus:border-neutral-600 focus:outline-none transition"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                placeholder="foydalanuvchi_nomi"
                required
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full h-11 px-3.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500 text-sm focus:border-neutral-600 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                Parol
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full h-11 px-3.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500 text-sm focus:border-neutral-600 focus:outline-none transition"
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                  Parolni takrorlang
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required={!isLogin}
                  minLength={6}
                  className="w-full h-11 px-3.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500 text-sm focus:border-neutral-600 focus:outline-none transition"
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-900/50 px-3.5 py-2.5 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-3 rounded-lg bg-white text-neutral-950 text-sm font-medium hover:bg-neutral-200 transition active:scale-[0.99] disabled:opacity-60 cursor-pointer"
            >
              {loading ? "Kutilmoqda..." : isLogin ? "Kirish" : "Ro‘yxatdan o‘tish"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-400">
            {isLogin ? "Hisobingiz yo‘qmi?" : "Allaqachon hisobingiz bormi?"}{" "}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                resetForm();
              }}
              className="text-white font-medium hover:underline cursor-pointer"
            >
              {isLogin ? "Ro‘yxatdan o‘tish" : "Kirish"}
            </button>
          </p>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-neutral-500">
        Muhammadrasul tomonidan asos solingan
      </footer>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo-white.png" alt="MR AI" width={36} height={36} className="animate-pulse" />
          <p className="text-sm text-neutral-400">Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;
  return <ChatApp />;
}

export default function Home() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
