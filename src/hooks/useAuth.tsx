"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { setDbUser } from "@/lib/serverDb";

export interface UserMetadata {
  full_name: string;
  username: string;
}

export interface User {
  id: string;
  email: string;
  user_metadata: UserMetadata;
}

export interface Session {
  user: User;
  access_token: string;
}

type RawUser = { username: string; name: string };

function toUser(u: RawUser): User {
  return {
    id: u.username,
    email: `${u.username}@mrai.local`,
    user_metadata: { full_name: u.name || u.username, username: u.username },
  };
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  updateProfile: (patch: { name?: string; oldPassword?: string; newPassword?: string }) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// The real account: the session lives on the server (a signed cookie). Access needs the access key + an account.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((raw: RawUser) => {
    setDbUser(raw.username); // brauzer keshi (IndexedDB) har foydalanuvchiga alohida
    setUser(toUser(raw));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/state", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (data?.access && data?.user) {
          apply(data.user);
          setLoading(false);
          return;
        }
      } catch {}
      if (alive) window.location.replace("/login");
    })();
    return () => {
      alive = false;
    };
  }, [apply]);

  const signOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {}
    setUser(null);
    window.location.href = "/login";
  };

  const updateProfile = async (patch: { name?: string; oldPassword?: string; newPassword?: string }) => {
    try {
      const res = await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.newPassword !== undefined ? { new_password: patch.newPassword, old_password: patch.oldPassword || "" } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { error: data?.error || "Something went wrong" };
      if (data?.user) setUser(toUser(data.user));
      return { error: null };
    } catch {
      return { error: "Could not connect to the server" };
    }
  };

  const session: Session | null = user ? { user, access_token: "session" } : null;

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, updateProfile }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
