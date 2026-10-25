"use client";

// Shared building blocks for Settings: the same flat, square, black-and-white language as the chat and file panel
// (1px borders, no radius, mono labels on buttons, white-on-black for the active state).
import type { ReactNode } from "react";

export const ui = {
  title: "text-[13.5px] font-medium text-neutral-100",
  hint: "text-[12px] leading-relaxed text-neutral-500",
  label: "block mb-1.5 text-[11px] font-mono uppercase tracking-wide text-neutral-500",
  card: "border border-white/15 bg-black",
  input:
    "h-10 w-full border border-white/20 bg-black px-3 text-[13px] text-neutral-100 placeholder:text-neutral-600 focus:border-white/45 focus:outline-none",
  textarea:
    "w-full p-3.5 border border-white/20 bg-black text-neutral-100 text-[13px] leading-relaxed placeholder:text-neutral-600 focus:border-white/45 focus:outline-none",
  primary:
    "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 bg-white text-black text-[12px] font-mono font-medium hover:bg-neutral-200 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
  secondary:
    "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 border border-white/25 text-white text-[12px] font-mono hover:bg-white hover:text-black transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
  icon: "h-8 w-8 inline-flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.08] transition cursor-pointer",
  iconDanger: "h-8 w-8 inline-flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-white/[0.08] transition cursor-pointer",
};

export function SectionHead({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="min-w-0">
        <h3 className={ui.title}>{title}</h3>
        {hint ? <p className={`${ui.hint} mt-1`}>{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="border border-dashed border-white/15 px-4 py-8 text-center">
      <p className="text-[13px] text-neutral-300">{title}</p>
      {hint ? <p className={`${ui.hint} mt-1`}>{hint}</p> : null}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className={ui.label}>{label}</label>
      {children}
      {hint ? <p className={`${ui.hint} mt-1.5`}>{hint}</p> : null}
    </div>
  );
}

export function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-white/10 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] text-neutral-100">{title}</div>
        {hint ? <div className={`${ui.hint} mt-0.5`}>{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 border transition cursor-pointer ${on ? "border-[#4cb4f7] bg-[#4cb4f7]" : "border-white/25 bg-black"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 transition-all ${on ? "left-[22px] bg-[#04121c]" : "left-0.5 bg-neutral-500"}`} />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex border border-white/20 text-[12px] font-mono">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`h-8 px-3 cursor-pointer transition ${value === o.id ? "bg-[#4cb4f7] text-[#04121c]" : "text-neutral-400 hover:text-white"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
