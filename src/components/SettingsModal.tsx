"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import KeysManager from "./KeysManager";
import ConnectorsPanel from "./ConnectorsPanel";
import TasksPanel from "./TasksPanel";
import UsagePanel from "./UsagePanel";
import SkillsPanel from "./SkillsPanel";
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

type SettingsTab = "keys" | "connectors" | "tasks" | "usage" | "skills" | "general";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "keys", label: "API kalitlar" },
  { id: "connectors", label: "Connectorlar" },
  { id: "tasks", label: "Vazifalar" },
  { id: "usage", label: "Usage" },
  { id: "skills", label: "Skills" },
  { id: "general", label: "Umumiy" },
];

export default function SettingsModal({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("keys");

  // App settings state (Model, Appearance)
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (open) setAppSettings(loadSettings());
  }, [open]);

  // Update Settings helper
  function updateAppSettings(patch: Partial<AppSettings>) {
    const updated = { ...appSettings, ...patch };
    setAppSettings(updated);
    saveSettings(updated);
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

        <div className="flex gap-1 px-5 border-b border-neutral-800 shrink-0 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2.5 text-xs font-medium transition cursor-pointer border-b-2 -mb-px shrink-0 whitespace-nowrap ${
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
          {activeTab === "usage" && <UsagePanel />}
          {activeTab === "skills" && <SkillsPanel />}

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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
