"use client";

import Image from "next/image";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ChatApp from "@/components/ChatApp";

// Har bir suhbatning o'z manzili bor: /c/<id>. Manzil faqat shu hisobning suhbatini ochadi.
const CHAT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function AppContent({ chatId }: { chatId: string | null }) {
  const { user, loading } = useAuth();

  // Kirmagan foydalanuvchini proxy /login ga yo'naltiradi; bu yerda faqat yuklanish holati.
  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo-white.png" alt="MR AI" width={36} height={36} className="animate-pulse" />
          <p className="text-sm text-neutral-400">Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  return <ChatApp initialChatId={chatId && CHAT_ID_RE.test(chatId) ? chatId : null} />;
}

export default function AppShell({ chatId = null }: { chatId?: string | null }) {
  return (
    <AuthProvider>
      <AppContent chatId={chatId} />
    </AuthProvider>
  );
}
