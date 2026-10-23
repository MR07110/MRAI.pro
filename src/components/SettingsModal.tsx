"use client";

import { useEffect, useState } from "react";
import {
  Trash2,
  X,
  Download,
} from "lucide-react";
import * as serverDb from "@/lib/serverDb";
import KeysManager from "./KeysManager";
import ConnectorsPanel from "./ConnectorsPanel";
import TasksPanel from "./TasksPanel";
import { useAuth } from "@/hooks/useAuth";
import {
  AppSettings,
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
} from "@/lib/settings";

interface Props {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = "keys" | "connectors" | "tasks" | "general" | "account";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "keys", label: "API kalitlar" },
  { id: "connectors", label: "Connectorlar" },
  { id: "tasks", label: "Vazifalar" },
  { id: "general", label: "Umumiy" },
  { id: "account", label: "Hisob" },
];

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-11 h-6 rounded-full transition cursor-pointer p-0.5 shrink-0 ${on ? "bg-white" : "bg-neutral-800"}`}
    >
      <div className={`w-5 h-5 rounded-full bg-neutral-950 transition transform ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

export default function SettingsModal({ open, onClose }: Props) {
  const { user, signOut, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>("keys");

  // App settings state (Model, Appearance)
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Account profile state
  const [newName, setNewName] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passMessage, setPassMessage] = useState("");
  const [passError, setPassError] = useState("");

  useEffect(() => {
    if (open && user) {
      setAppSettings(loadSettings());
      setNewName(user.user_metadata?.full_name || "");
    }
  }, [open, user]);

  // Update Settings helper
  function updateAppSettings(patch: Partial<AppSettings>) {
    const updated = { ...appSettings, ...patch };
    setAppSettings(updated);
    saveSettings(updated);
  }

  // Update Profile Name (serverda saqlanadi)
  async function handleUpdateName() {
    if (!newName.trim()) return;
    const r = await updateProfile({ name: newName.trim() });
    if (!r.error) {
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    }
  }

  // Change password (joriy parol serverda tekshiriladi)
  async function handleChangePassword() {
    setPassError("");
    setPassMessage("");
    if (!oldPassword) {
      setPassError("Joriy parolni kiriting");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setPassError("Yangi parol kamida 6 ta belgidan iborat bo‘lishi kerak");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError("Parollar mos kelmadi");
      return;
    }
    const r = await updateProfile({ oldPassword, newPassword });
    if (r.error) {
      setPassError(r.error);
      return;
    }
    setPassMessage("Parol muvaffaqiyatli yangilandi!");
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  // Export chats
  async function handleExportChats() {
    try {
      const chats = await serverDb.getChats();
      const fullData = await Promise.all(
        chats.map(async (c) => ({
          ...c,
          messages: await serverDb.getMessages(c.id),
        }))
      );

      const blob = new Blob([JSON.stringify(fullData || [], null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mr-ai-chats-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  // Clear all chats
  async function handleClearAllChats() {
    if (!confirm("DIQQAT: Barcha suhbatlar va xabarlar o‘chiriladi. Ushbu amalni ortga qaytarib bo‘lmaydi. Rozimisiz?"))
      return;
    await serverDb.deleteAllChats();
    window.location.reload();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-neutral-900 text-neutral-100 rounded-2xl shadow-2xl border border-neutral-800 max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <h2 className="text-base font-semibold text-neutral-100">Sozlamalar</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-5 border-b border-neutral-800 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2.5 text-xs font-medium transition cursor-pointer border-b-2 -mb-px ${
                activeTab === t.id
                  ? "border-white text-white"
                  : "border-transparent text-neutral-500 hover:text-neutral-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === "connectors" && <ConnectorsPanel />}
          {activeTab === "tasks" && <TasksPanel />}

          {activeTab === "keys" && <KeysManager />}

          {activeTab === "general" && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-neutral-300">Tizim ko‘rsatmasi</label>
                  <button
                    onClick={() =>
                      updateAppSettings({
                        systemPrompt: DEFAULT_SETTINGS.systemPrompt,
                        systemPromptPreset: DEFAULT_SETTINGS.systemPromptPreset,
                      })
                    }
                    className="text-xs text-neutral-500 hover:text-white transition cursor-pointer"
                  >
                    Standartga qaytarish
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={appSettings.systemPrompt}
                  onChange={(e) =>
                    updateAppSettings({ systemPrompt: e.target.value, systemPromptPreset: "custom" })
                  }
                  placeholder="AI qanday javob berishi kerakligini yozing..."
                  className="w-full p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 text-xs placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Shrift o‘lchami</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "sm", label: "Kichik" },
                    { id: "base", label: "Standart" },
                    { id: "lg", label: "Katta" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => updateAppSettings({ fontSize: f.id as AppSettings["fontSize"] })}
                      className={`py-2.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                        appSettings.fontSize === f.id
                          ? "bg-white text-neutral-950 border-white"
                          : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-neutral-200">Agent rejimi</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    AI kompyuter, connectorlar va vazifalarni o‘zi ishlatadi (tool-calling qo‘llaydigan model kerak)
                  </p>
                </div>
                <Toggle
                  on={appSettings.agentMode !== false}
                  onChange={() => updateAppSettings({ agentMode: appSettings.agentMode === false })}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-neutral-200">Enter bilan yuborish</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {appSettings.sendOnEnter ? "Shift+Enter — yangi qator" : "Ctrl+Enter — yuborish"}
                  </p>
                </div>
                <Toggle
                  on={appSettings.sendOnEnter}
                  onChange={() => updateAppSettings({ sendOnEnter: !appSettings.sendOnEnter })}
                />
              </div>
            </div>
          )}

          {activeTab === "account" && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-neutral-100 truncate">
                  {user?.user_metadata?.full_name || "Foydalanuvchi"}
                </p>
                <p className="text-xs text-neutral-500 font-mono">
                  @{user?.user_metadata?.username || user?.email?.split("@")[0]}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Ism</label>
                <div className="flex gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Yangi ism"
                    className="flex-1 h-10 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-sm text-neutral-100 focus:border-neutral-600 focus:outline-none"
                  />
                  <button
                    onClick={handleUpdateName}
                    className="px-4 h-10 rounded-xl bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-200 transition cursor-pointer"
                  >
                    {nameSaved ? "Saqlandi" : "Saqlash"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Parol</label>
                <div className="space-y-2">
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Joriy parol"
                    autoComplete="current-password"
                    className="w-full h-10 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-sm text-neutral-100 focus:border-neutral-600 focus:outline-none"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Yangi parol (kamida 6 belgi)"
                    className="w-full h-10 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-sm text-neutral-100 focus:border-neutral-600 focus:outline-none"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Parolni takrorlang"
                    className="w-full h-10 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-sm text-neutral-100 focus:border-neutral-600 focus:outline-none"
                  />
                  {passError && <p className="text-xs text-red-400">{passError}</p>}
                  {passMessage && <p className="text-xs text-emerald-400">{passMessage}</p>}
                  <button
                    onClick={handleChangePassword}
                    className="w-full h-10 rounded-xl border border-neutral-800 text-neutral-200 text-xs font-medium hover:bg-neutral-800 transition cursor-pointer"
                  >
                    Parolni yangilash
                  </button>
                </div>
              </div>

              <div className="pt-5 border-t border-neutral-800 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleExportChats}
                    className="h-10 rounded-xl border border-neutral-800 text-neutral-200 text-xs font-medium hover:bg-neutral-800 transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Suhbatlarni yuklab olish
                  </button>
                  <button
                    onClick={handleClearAllChats}
                    className="h-10 rounded-xl border border-neutral-800 text-red-400 text-xs font-medium hover:bg-red-950/40 transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Suhbatlarni tozalash
                  </button>
                </div>
                <button
                  onClick={signOut}
                  className="w-full h-10 rounded-xl border border-neutral-800 text-neutral-300 text-xs font-medium hover:bg-neutral-800 transition cursor-pointer"
                >
                  Chiqish
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
