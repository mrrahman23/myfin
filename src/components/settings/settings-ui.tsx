"use client";

import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SettingsHeader({ title, back = "/settings", action }: { title: string; back?: string; action?: ReactNode }) {
  return (
    <header className="mb-5 pt-2 lg:mb-7">
      <Link href={back} className="-ml-1.5 mb-1 inline-flex items-center gap-0.5 text-[15px] font-medium text-accent">
        <ChevronLeft className="h-5 w-5" /> Settings
      </Link>
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em] lg:text-[34px]">{title}</h1>
        {action}
      </div>
    </header>
  );
}

export function SettingsGroup({ title, footer, children, className }: { title?: string; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mb-6", className)}>
      {title ? <h2 className="mb-1.5 px-4 text-[12.5px] font-semibold uppercase tracking-wide text-ink-3">{title}</h2> : null}
      <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card">{children}</div>
      {footer ? <p className="mt-1.5 px-4 text-[12.5px] leading-relaxed text-ink-3">{footer}</p> : null}
    </section>
  );
}

const ICON_TONES = {
  blue: "bg-[#2a78d6]",
  orange: "bg-[#eb6834]",
  green: "bg-[#1f9d55]",
  violet: "bg-[#6250d6]",
  gray: "bg-[#8e8e93]",
  red: "bg-[#d03b3b]",
  teal: "bg-[#1baf7a]",
  yellow: "bg-[#d99400]",
} as const;

export function SettingsRow({
  icon: Icon,
  tone = "gray",
  label,
  value,
  href,
  onClick,
  trailing,
  destructive,
}: {
  icon?: LucideIcon;
  tone?: keyof typeof ICON_TONES;
  label: ReactNode;
  value?: ReactNode;
  href?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  destructive?: boolean;
}) {
  const content = (
    <>
      {Icon ? (
        <span className={cn("grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] text-white", ICON_TONES[tone])}>
          <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
        </span>
      ) : null}
      <span className={cn("min-w-0 flex-1 truncate text-[15px]", destructive && "font-medium text-negative")}>{label}</span>
      {value ? <span className="max-w-[45%] truncate text-[15px] text-ink-3">{value}</span> : null}
      {trailing}
      {href || (onClick && !trailing) ? <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden /> : null}
    </>
  );
  const cls = "flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left transition-colors";
  if (href)
    return (
      <Link href={href} className={cn(cls, "hover:bg-surface-2 active:bg-surface-3/60")}>
        {content}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(cls, "hover:bg-surface-2 active:bg-surface-3/60")}>
        {content}
      </button>
    );
  return <div className={cls}>{content}</div>;
}
