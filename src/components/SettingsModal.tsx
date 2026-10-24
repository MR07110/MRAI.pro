"use client";

import { useEffect, useState } from "react";
import { BarChart3, CalendarClock, KeyRound, Plug, Sparkles, SlidersHorizontal, X } from "lucide-react";
import KeysManager from "./KeysManager";
import ConnectorsPanel from "./ConnectorsPanel";
import TasksPanel from "./TasksPanel";
import UsagePanel from "./UsagePanel";
import SkillsPanel from "./SkillsPanel";
import { AppSettings, loadSettings, saveSettings, DEFAULT_SETTINGS, SYSTEM_PROMPT_PRESETS } from "@/lib/settings";
import { Field, Row, SectionHead, Segmented, Switch, ui } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = "keys" | "connectors" | "tasks" | "usage" | "skills" | "general";

const TABS: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "keys", label: "API keys", icon: KeyRound },
  { id: "connectors", label: "Connectors", icon: Plug },
  { id: "tasks", label: "Tasks", icon: CalendarClock },
  { id: "usage", label: "Usage", icon: BarChart3 },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "general", label: "General", icon: SlidersHorizontal },
];

export default function SettingsModal({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("keys");
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (open) setAppSettings(loadSettings());
  }, [open]);

  function updateAppSettings(patch: Partial<AppSettings>) {
    const updated = { ...appSettings, ...patch };
    setAppSettings(updated);
    saveSettings(updated);
  }

  if (!open) return null;

  const active = TABS.find((t) => t.id === activeTab) || TABS[0];
  const iconBtn =
    "h-8 w-8 inline-flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/[0.07] transition cursor-pointer";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center md:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full md:max-w-4xl h-full md:h-[min(42rem,88vh)] flex flex-col md:flex-row bg-black text-neutral-100 md:border border-white/20 overflow-hidden fade-up"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Mobile: title + horizontal sections */}
        <div className="md:hidden shrink-0 bg-[#0a0a0a] border-b border-white/15">
          <div className="flex items-center justify-between h-12 px-3">
            <h2 className="brand-font text-[15px] tracking-tight text-neutral-100">Settings</h2>
            <button onClick={onClose} className={iconBtn} title="Close">
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>
          <div className="flex overflow-x-auto px-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 h-10 text-[13px] font-medium transition cursor-pointer border-b border-transparent shrink-0 whitespace-nowrap ${
                  activeTab === t.id ? "!border-white text-white" : "text-neutral-500 hover:text-neutral-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: left menu (same style as the sidebar) */}
        <nav className="hidden md:flex flex-col w-52 shrink-0 bg-[#0a0a0a] border-r border-white/15">
          <div className="flex items-center h-12 px-4 shrink-0">
            <h2 className="brand-font text-[15px] tracking-tight text-neutral-100">Settings</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              const on = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`w-full flex items-center gap-2.5 h-9 px-2.5 text-[13.5px] font-medium transition cursor-pointer ${
                    on ? "bg-white/[0.09] text-white" : "text-neutral-400 hover:bg-white/[0.07] hover:text-white"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${on ? "text-white" : "text-neutral-500"}`} />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <section className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="hidden md:flex items-center justify-between h-12 px-5 border-b border-white/15 shrink-0">
            <h3 className="text-[13.5px] font-medium text-neutral-100">{active.label}</h3>
            <button onClick={onClose} className={iconBtn} title="Close">
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5">
            {activeTab === "connectors" && <ConnectorsPanel />}
            {activeTab === "tasks" && <TasksPanel />}
            {activeTab === "usage" && <UsagePanel />}
            {activeTab === "skills" && <SkillsPanel />}
            {activeTab === "keys" && <KeysManager />}

            {activeTab === "general" && (
              <div>
                <SectionHead title="General" hint="Instructions and behaviour of the assistant. Everything the AI receives is written in the system prompt below." />

                <div className="space-y-5">
                  <Field label="Preset">
                    <select
                      value={appSettings.systemPromptPreset}
                      onChange={(e) => {
                        const p = SYSTEM_PROMPT_PRESETS.find((x) => x.id === e.target.value);
                        updateAppSettings(p && p.id !== "custom" ? { systemPromptPreset: p.id, systemPrompt: p.prompt } : { systemPromptPreset: "custom" });
                      }}
                      className={`${ui.input} cursor-pointer`}
                    >
                      {SYSTEM_PROMPT_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wide text-neutral-500">System prompt</label>
                      <button
                        onClick={() =>
                          updateAppSettings({
                            systemPrompt: DEFAULT_SETTINGS.systemPrompt,
                            systemPromptPreset: DEFAULT_SETTINGS.systemPromptPreset,
                          })
                        }
                        className="text-[12px] text-neutral-500 hover:text-white transition cursor-pointer"
                      >
                        Reset to default
                      </button>
                    </div>
                    <textarea
                      rows={9}
                      value={appSettings.systemPrompt}
                      onChange={(e) => updateAppSettings({ systemPrompt: e.target.value, systemPromptPreset: "custom" })}
                      placeholder="Describe how the AI should respond…"
                      className={ui.textarea}
                    />
                  </div>

                  <div className={`${ui.card} px-4`}>
                    <Row title="Agent mode" hint="Let the AI use tools on your computer.">
                      <Switch on={appSettings.agentMode} onChange={(v) => updateAppSettings({ agentMode: v })} label="Agent mode" />
                    </Row>
                    <Row title="Max agent steps" hint="Upper limit of tool steps per reply.">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={appSettings.agentMaxSteps}
                        onChange={(e) => updateAppSettings({ agentMaxSteps: Math.min(1000, Math.max(1, Number(e.target.value) || 1)) })}
                        className={`${ui.input} !h-8 w-24 text-right font-mono`}
                      />
                    </Row>
                    <Row title="Send with Enter" hint="Shift+Enter always adds a new line.">
                      <Switch on={appSettings.sendOnEnter} onChange={(v) => updateAppSettings({ sendOnEnter: v })} label="Send with Enter" />
                    </Row>
                    <Row title="Text size">
                      <Segmented
                        value={appSettings.fontSize}
                        onChange={(v) => updateAppSettings({ fontSize: v })}
                        options={[
                          { id: "sm", label: "S" },
                          { id: "base", label: "M" },
                          { id: "lg", label: "L" },
                        ]}
                      />
                    </Row>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
