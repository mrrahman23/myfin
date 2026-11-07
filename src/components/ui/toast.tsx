"use client";

import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void | Promise<void> };
}
interface ToastApi {
  show: (message: string, opts?: { tone?: Tone; action?: ToastItem["action"]; duration?: number }) => void;
  success: (message: string, action?: ToastItem["action"]) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback<ToastApi["show"]>(
    (message, opts = {}) => {
      const id = nextId.current++;
      const item: ToastItem = { id, message, tone: opts.tone ?? "info", action: opts.action };
      setItems((list) => [...list.slice(-2), item]);
      window.setTimeout(() => dismiss(id), opts.duration ?? (opts.action ? 6000 : 3200));
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, action) => show(message, { tone: "success", action }),
      error: (message) => show(message, { tone: "error", duration: 5000 }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-md animate-toast items-center gap-3 rounded-2xl bg-[#1c1c1f] py-3 pl-4 pr-2 text-[14px] text-white shadow-float dark:bg-[#2c2c30]"
          >
            {t.tone === "success" ? (
              <CircleCheck className="h-5 w-5 shrink-0 text-[#34c759]" />
            ) : t.tone === "error" ? (
              <CircleAlert className="h-5 w-5 shrink-0 text-[#ff6961]" />
            ) : (
              <Info className="h-5 w-5 shrink-0 text-[#64a8ff]" />
            )}
            <span className="min-w-0 flex-1 leading-snug">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                onClick={async () => {
                  dismiss(t.id);
                  await t.action?.onClick();
                }}
                className={cn("shrink-0 rounded-xl px-3 py-1.5 text-[14px] font-semibold text-[#64a8ff] hover:bg-white/10")}
              >
                {t.action.label}
              </button>
            ) : (
              <span className="w-2" />
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
