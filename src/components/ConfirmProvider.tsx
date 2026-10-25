"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button red and shows a warning icon — for destructive actions. */
  danger?: boolean;
}

export interface AlertOptions {
  title: string;
  message?: React.ReactNode;
  okLabel?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
type AlertFn = (opts: AlertOptions) => Promise<void>;

const ConfirmContext = createContext<ConfirmFn | null>(null);
const AlertContext = createContext<AlertFn | null>(null);

/** Replaces window.confirm everywhere in MRAI: await confirm({ title, message, danger }) -> boolean. */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error("useConfirm() must be used inside <ConfirmProvider>");
  return fn;
}

/** Replaces window.alert everywhere in MRAI: await alert({ title, message }). A single OK button. */
export function useAlert(): AlertFn {
  const fn = useContext(AlertContext);
  if (!fn) throw new Error("useAlert() must be used inside <ConfirmProvider>");
  return fn;
}

type DialogState = { kind: "confirm"; opts: ConfirmOptions } | { kind: "alert"; opts: AlertOptions };

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ kind: "confirm", opts });
    });
  }, []);

  const alertFn = useCallback<AlertFn>((opts) => {
    return new Promise<void>((resolve) => {
      resolverRef.current = () => resolve();
      setState({ kind: "alert", opts });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState(null);
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  const isAlert = state?.kind === "alert";
  const danger = state?.kind === "confirm" && !!state.opts.danger;

  return (
    <ConfirmContext.Provider value={confirm}>
      <AlertContext.Provider value={alertFn}>
        {children}
        {state && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => close(false)} />
            <div role="alertdialog" aria-modal="true" aria-label={state.opts.title} className="relative w-full max-w-sm border border-white/20 bg-black text-neutral-100 shadow-2xl fade-up">
              <div className="p-5 flex items-start gap-3">
                {danger && <TriangleAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <h3 className="text-[14.5px] font-medium text-white">{state.opts.title}</h3>
                  {state.opts.message && <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">{state.opts.message}</p>}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 pb-4">
                {!isAlert && (
                  <button
                    type="button"
                    onClick={() => close(false)}
                    className="h-9 px-3.5 text-[13px] text-neutral-300 hover:bg-white/[0.07] transition cursor-pointer"
                  >
                    {(state.opts as ConfirmOptions).cancelLabel || "Cancel"}
                  </button>
                )}
                <button
                  type="button"
                  autoFocus
                  onClick={() => close(true)}
                  className={`h-9 px-3.5 text-[13px] font-medium transition cursor-pointer ${
                    danger ? "bg-red-500/90 text-white hover:bg-red-500" : "bg-white text-black hover:bg-neutral-200"
                  }`}
                >
                  {isAlert ? (state.opts as AlertOptions).okLabel || "OK" : (state.opts as ConfirmOptions).confirmLabel || "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
      </AlertContext.Provider>
    </ConfirmContext.Provider>
  );
}
