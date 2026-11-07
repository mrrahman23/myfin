"use client";

import { cn } from "@/lib/cn";
import type { HouseholdItem } from "@/lib/household/types";

const SIZES = {
  sm: "h-10 w-10 rounded-[12px] text-[22px]",
  md: "h-12 w-12 rounded-[14px] text-[26px]",
  lg: "h-16 w-16 rounded-[18px] text-[36px]",
  tile: "aspect-square w-full rounded-[18px] text-[44px]",
  hero: "h-24 w-24 rounded-[22px] text-[54px]",
} as const;

/** The item's photo if it has one, otherwise its emoji (or its initial). */
export function ItemImage({
  item,
  size = "sm",
  className,
}: {
  item: Pick<HouseholdItem, "name" | "emoji" | "image_url">;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden bg-surface-2 leading-none", SIZES[size], className)} aria-hidden>
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : item.emoji ? (
        <span className="select-none">{item.emoji}</span>
      ) : (
        <span className="select-none text-[0.6em] font-semibold text-ink-3">{item.name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}
