"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import KeysManager from "./KeysManager";

interface Props {
  open: boolean;
  onClose: () => void;
}

// Chat kiritish joyidan turib model va kalitni almashtirish oynasi.
export default function QuickModel({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-neutral-900 text-neutral-100 border border-neutral-800 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h2 className="text-sm font-semibold">Model va kalit</h2>
          <button
            onClick={onClose}
            aria-label="Yopish"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 pt-2">
          <KeysManager compact onSelected={onClose} />
        </div>
      </div>
    </div>
  );
}
