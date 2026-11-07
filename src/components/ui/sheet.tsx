"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { Button } from "./primitives";

/**
 * Bottom sheet on phones, centered dialog on larger screens.
 * Escape / backdrop / swipe-down close it; body scroll is locked while open.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panelRef.current;
      target?.focus({ preventScroll: true });
    }, 60);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const widths = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-float outline-none transition-transform sm:rounded-[28px]",
          widths[size],
        )}
      >
        <div
          className="flex shrink-0 justify-center pb-1 pt-2.5 sm:hidden"
          onTouchStart={(e) => (dragStart.current = e.touches[0].clientY)}
          onTouchMove={(e) => {
            if (dragStart.current === null) return;
            setDragY(Math.max(0, e.touches[0].clientY - dragStart.current));
          }}
          onTouchEnd={() => {
            if (dragY > 110) onClose();
            setDragY(0);
            dragStart.current = null;
          }}
        >
          <span className="h-[5px] w-10 rounded-full bg-line-strong" />
        </div>
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-1 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
              {title}
            </h2>
            {description ? <div className="mt-0.5 text-[13px] text-ink-3">{description}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-3 text-ink-2 transition hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        ) : (
          <div className="h-[env(safe-area-inset-bottom)] shrink-0" />
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  destructive,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} size="sm">
      {body ? <div className="text-[15px] leading-relaxed text-ink-2">{body}</div> : null}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} loading={loading} data-autofocus>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
