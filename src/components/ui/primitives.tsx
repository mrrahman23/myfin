"use client";

import { Check, Loader2 } from "lucide-react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "tinted";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-inverse hover:opacity-90 active:opacity-80",
  accent: "bg-accent text-white hover:brightness-110 active:brightness-95",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2 active:bg-surface-3",
  tinted: "bg-accent-soft text-accent hover:brightness-105 active:brightness-95",
  ghost: "text-ink-2 hover:bg-surface-3/70 hover:text-ink active:bg-surface-3",
  danger: "bg-negative-soft text-negative hover:brightness-105 active:brightness-95",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-full gap-1.5",
  md: "h-11 px-5 text-[15px] rounded-full gap-2",
  lg: "h-[52px] px-6 text-base rounded-2xl gap-2 w-full",
  icon: "h-10 w-10 rounded-full",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold tracking-[-0.01em] transition-[background,opacity,filter,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-card", className)}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------
const fieldBase =
  "w-full rounded-xl border border-line-strong bg-surface-2 px-3.5 text-[16px] text-ink placeholder:text-ink-3 transition-colors focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent-soft disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, "h-12", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, "min-h-[84px] py-3", className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(fieldBase, "h-12 appearance-none pr-10", className)} {...rest}>
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
        fill="currentColor"
      >
        <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});

export function Field({
  label,
  error,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] text-negative">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

/** Currency-prefixed numeric input (string value, parsed by the caller). */
export const AmountInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { symbol?: string }>(
  function AmountInput({ symbol = "৳", className, ...rest }, ref) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] font-medium text-ink-3">
          {symbol}
        </span>
        <input
          ref={ref}
          inputMode="decimal"
          autoComplete="off"
          className={cn(fieldBase, "h-12 pl-9 text-[17px] font-semibold tabular", className)}
          {...rest}
        />
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50",
        checked ? "bg-positive" : "bg-surface-3",
      )}
    >
      <span
        className={cn(
          "inline-block h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Pay check — the one-tap Paid / Received control
// ---------------------------------------------------------------------------
export function PayCheck({
  state,
  onToggle,
  label,
  busy,
  tone = "expense",
}: {
  state: "unpaid" | "partial" | "paid";
  onToggle: () => void;
  label: string;
  busy?: boolean;
  tone?: "income" | "expense";
}) {
  const color = tone === "income" ? "var(--income)" : "var(--positive)";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "paid" ? true : state === "partial" ? "mixed" : false}
      aria-label={label}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="group relative -m-2 grid h-12 w-12 shrink-0 place-items-center rounded-full disabled:opacity-60"
    >
      <span
        className={cn(
          "grid h-[30px] w-[30px] place-items-center rounded-full border-2 transition-all duration-200 group-active:scale-90",
          state === "paid" ? "border-transparent" : "border-line-strong bg-surface group-hover:border-ink-3",
        )}
        style={state === "paid" ? { background: color } : state === "partial" ? { borderColor: color } : undefined}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-ink-3" aria-hidden />
        ) : state === "paid" ? (
          <Check className="h-[18px] w-[18px] animate-pop text-white" strokeWidth={3} aria-hidden />
        ) : state === "partial" ? (
          <span
            aria-hidden
            className="h-[18px] w-[18px] rounded-full"
            style={{ background: `conic-gradient(${color} 0 50%, transparent 50% 100%)` }}
          />
        ) : null}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-xl bg-surface-3/80 p-[3px]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 whitespace-nowrap rounded-[9px] font-semibold transition-all duration-200",
            size === "sm" ? "px-3 py-1.5 text-[12px]" : "px-4 py-2 text-[13px]",
            value === o.value ? "bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-3/70", className)} />;
}

export function ProgressBar({
  value,
  color = "var(--accent)",
  className,
  label,
}: {
  value: number;
  color?: string;
  className?: string;
  label: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-ink-2">{icon}</div> : null}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body ? <p className="mt-1 max-w-xs text-[13px] text-ink-3">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "warning" | "accent";
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface-3 text-ink-2",
    positive: "bg-positive-soft text-positive",
    negative: "bg-negative-soft text-negative",
    warning: "bg-warning-soft text-warning",
    accent: "bg-accent-soft text-accent",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
