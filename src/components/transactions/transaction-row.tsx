"use client";

import { ArrowLeftRight, Link2, SlidersHorizontal } from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { toMinor } from "@/lib/money";
import type { Category, PaymentMethod, Transaction } from "@/lib/types";

export function TransactionRow({
  t,
  categories,
  methods,
  onClick,
  showDate = false,
  year,
}: {
  t: Transaction;
  categories: Map<string, Category>;
  methods: Map<string, PaymentMethod>;
  onClick?: () => void;
  showDate?: boolean;
  year?: number;
}) {
  const cat = t.category_id ? categories.get(t.category_id) : undefined;
  const method = t.payment_method_id ? methods.get(t.payment_method_id) : undefined;
  const toMethod = t.to_payment_method_id ? methods.get(t.to_payment_method_id) : undefined;
  const amount = toMinor(t.amount);
  const title =
    t.description ||
    cat?.name ||
    (t.kind === "transfer" ? "Transfer" : t.kind === "adjustment" ? "Balance adjustment" : t.kind === "income" ? "Income" : "Expense");
  const sub = [
    showDate ? formatDate(t.txn_date, year) : null,
    t.kind === "transfer" ? `${method?.name ?? "—"} → ${toMethod?.name ?? "—"}` : cat && t.description ? cat.name : null,
    t.kind !== "transfer" ? method?.name : null,
  ].filter(Boolean);

  const signed = t.kind === "expense" ? -amount : amount;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 active:bg-surface-3/60 sm:px-5"
      >
        {t.kind === "transfer" ? (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-surface-3 text-ink-2">
            <ArrowLeftRight className="h-[18px] w-[18px]" />
          </span>
        ) : t.kind === "adjustment" ? (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-surface-3 text-ink-2">
            <SlidersHorizontal className="h-[18px] w-[18px]" />
          </span>
        ) : (
          <CategoryIcon icon={cat?.icon} kind={t.kind} />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[15px] font-medium tracking-[-0.01em]">
            <span className="truncate">{title}</span>
            {t.obligation_id ? <Link2 className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-label="Linked to a monthly item" /> : null}
          </p>
          {sub.length ? <p className="truncate text-[12.5px] text-ink-3">{sub.join(" · ")}</p> : null}
        </div>
        <Money
          value={signed}
          signed={t.kind !== "transfer"}
          className={cn(
            "shrink-0 text-[15px] font-semibold",
            t.kind === "income" || (t.kind === "adjustment" && amount > 0) ? "text-positive" : t.kind === "transfer" ? "text-ink-2" : "text-ink",
          )}
        />
      </button>
    </li>
  );
}
