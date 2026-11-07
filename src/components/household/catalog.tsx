"use client";

import { Check, Ellipsis, Plus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, EmptyState, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/data/app-context";
import { errorMessage } from "@/lib/data/errors";
import type { ItemView } from "@/lib/household/hooks";
import { addStarterItems, cancelRequest, requestItem } from "@/lib/household/mutations";
import { formatQty } from "@/lib/household/predict";
import { ITEM_CATEGORIES } from "@/lib/household/types";
import { ItemImage } from "./item-image";

const CATEGORY_BN: Record<string, string> = {
  "Grains & Flour": "চাল-আটা",
  "Oil & Ghee": "তেল",
  "Lentils & Pulses": "ডাল",
  Vegetables: "সবজি",
  Fruits: "ফল",
  "Fish & Meat": "মাছ-মাংস",
  "Dairy & Eggs": "দুধ-ডিম",
  Spices: "মসলা",
  Beverages: "পানীয়",
  Snacks: "নাস্তা",
  Frozen: "ফ্রোজেন",
  Cleaning: "পরিষ্কার",
  "Personal care": "ব্যক্তিগত",
  Baby: "বাচ্চা",
  Other: "অন্যান্য",
};

/**
 * Tap-to-add grid. Tapping an item that isn't on the list adds it straight
 * away (usual quantity) with an Undo; tapping one already on the list opens
 * it so the quantity or note can be changed.
 */
export function Catalog({
  views,
  onEditRequest,
  onEditItem,
  onNewItem,
}: {
  views: ItemView[];
  onEditRequest: (v: ItemView) => void;
  onEditItem: (v: ItemView) => void;
  onNewItem: (category?: string) => void;
}) {
  const toast = useToast();
  const { user } = useSession();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [loadingStarter, setLoadingStarter] = useState(false);

  const active = useMemo(() => views.filter((v) => !v.item.is_archived), [views]);
  const categories = useMemo(() => {
    const present = new Set(active.map((v) => v.item.category || "Other"));
    return ITEM_CATEGORIES.filter((c) => present.has(c));
  }, [active]);

  const q = query.trim().toLowerCase();
  const shown = active
    .filter((v) => category === "all" || (v.item.category || "Other") === category)
    .filter((v) => !q || v.item.name.toLowerCase().includes(q) || (v.item.name_bn ?? "").includes(query.trim()))
    .sort(
      (a, b) =>
        ITEM_CATEGORIES.indexOf((a.item.category || "Other") as (typeof ITEM_CATEGORIES)[number]) -
          ITEM_CATEGORIES.indexOf((b.item.category || "Other") as (typeof ITEM_CATEGORIES)[number]) ||
        a.item.sort_order - b.item.sort_order ||
        a.item.name.localeCompare(b.item.name),
    );
  const groups = useMemo(() => {
    const map = new Map<string, ItemView[]>();
    for (const v of shown) map.set(v.item.category || "Other", [...(map.get(v.item.category || "Other") ?? []), v]);
    return [...map.entries()];
  }, [shown]);

  async function tap(v: ItemView) {
    if (v.openRequest) return onEditRequest(v);
    if (busy) return;
    setBusy(v.item.id);
    if ("vibrate" in navigator) navigator.vibrate?.(8);
    try {
      const qty = v.item.default_qty ? Number(v.item.default_qty) : null;
      const id = await requestItem({ itemId: v.item.id, qty, urgency: "normal" });
      toast.show(`${v.item.name_bn ?? v.item.name}${qty ? ` · ${formatQty(qty, v.item.unit)}` : ""} added`, {
        tone: "success",
        group: "catalog-add",
        duration: 4000,
        action: {
          label: "Undo",
          onClick: async () => {
            if (user) await cancelRequest(id, user.id).catch((e) => toast.error(errorMessage(e)));
          },
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search · খুঁজুন"
          aria-label="Search items"
          className="h-11 pl-10"
        />
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {["all", ...categories].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className={cn(
              "h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition",
              category === c ? "bg-ink text-inverse" : "bg-surface text-ink-2 shadow-card hover:text-ink",
            )}
          >
            {c === "all" ? "All · সব" : `${c} · ${CATEGORY_BN[c] ?? ""}`}
          </button>
        ))}
      </div>

      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="Start with the ready-made list"
            body="About 60 everyday items in English and বাংলা — rice, oil, vegetables, fish, diapers and more."
            action={
              <Button
                loading={loadingStarter}
                onClick={async () => {
                  setLoadingStarter(true);
                  try {
                    const n = await addStarterItems();
                    toast.success(`${n} items added`);
                  } catch (e) {
                    toast.error(errorMessage(e));
                  } finally {
                    setLoadingStarter(false);
                  }
                }}
              >
                Add starter items
              </Button>
            }
          />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            title="Not in the catalogue"
            body={query ? `Add “${query.trim()}” so it's one tap next time.` : "Nothing in this category yet."}
            action={
              <Button size="sm" onClick={() => onNewItem(category === "all" ? undefined : category)}>
                <Plus className="h-4 w-4" /> New item
              </Button>
            }
          />
        </Card>
      ) : (
        groups.map(([cat, list]) => (
          <section key={cat}>
            <h3 className="mb-2 px-1 text-[13px] font-semibold text-ink-3">
              {cat} <span className="font-normal">· {CATEGORY_BN[cat] ?? ""}</span>
            </h3>
            <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
              {list.map((v) => {
                const on = Boolean(v.openRequest);
                return (
                  <li key={v.item.id} className="relative">
                    <button
                      type="button"
                      onClick={() => tap(v)}
                      disabled={busy === v.item.id}
                      aria-pressed={on}
                      aria-label={`${v.item.name}${v.item.name_bn ? `, ${v.item.name_bn}` : ""}. ${on ? "On the list — tap to change" : "Tap to add to the list"}`}
                      className={cn(
                        "flex h-full w-full flex-col items-center gap-1.5 rounded-[20px] border bg-surface p-2 pb-2.5 text-center shadow-card transition active:scale-[0.97] disabled:opacity-60",
                        on ? "border-positive ring-2 ring-positive/40" : "border-line hover:border-line-strong",
                      )}
                    >
                      <ItemImage item={v.item} size="tile" />
                      <span className="w-full">
                        <span className="block truncate text-[13px] font-semibold leading-tight">{v.item.name_bn ?? v.item.name}</span>
                        {v.item.name_bn ? <span className="block truncate text-[11px] leading-tight text-ink-3">{v.item.name}</span> : null}
                      </span>
                    </button>
                    {on ? (
                      <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-positive px-2 py-0.5 text-[11px] font-bold text-white shadow">
                        <Check className="h-3 w-3" strokeWidth={3} />
                        {v.openRequest?.qty ? formatQty(v.openRequest.qty, v.item.unit) : "List"}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onEditItem(v)}
                      aria-label={`Edit ${v.item.name}`}
                      className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-surface/85 text-ink-3 shadow-sm backdrop-blur hover:text-ink"
                    >
                      <Ellipsis className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => onNewItem(cat === "Other" ? undefined : cat)}
                  className="flex h-full min-h-[132px] w-full flex-col items-center justify-center gap-1 rounded-[20px] border border-dashed border-line-strong text-ink-3 transition hover:border-accent hover:text-accent"
                >
                  <Plus className="h-6 w-6" />
                  <span className="text-[12px] font-semibold">New</span>
                </button>
              </li>
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
