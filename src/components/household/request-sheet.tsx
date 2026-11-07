"use client";

import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Field, Input, Select, Switch, Textarea } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/data/app-context";
import { errorMessage } from "@/lib/data/errors";
import type { ItemView } from "@/lib/household/hooks";
import { cancelRequest, requestItem, updateRequest } from "@/lib/household/mutations";
import { formatQty } from "@/lib/household/predict";
import { COMMON_ITEMS, ITEM_CATEGORIES, UNITS, type ShoppingRequest } from "@/lib/household/types";
import { ItemImage } from "./item-image";

export interface RequestTarget {
  /** Existing request to edit. */
  request?: ShoppingRequest;
  /** Pre-selected item. */
  itemId?: string;
}

export function RequestSheet({
  target,
  views,
  onClose,
}: {
  target: RequestTarget | null;
  views: ItemView[];
  onClose: () => void;
}) {
  const editing = Boolean(target?.request);
  return (
    <Sheet open={Boolean(target)} onClose={onClose} title={editing ? "Edit list item" : "Add to shopping list"}>
      {target ? <RequestForm key={target.request?.id ?? target.itemId ?? "new"} target={target} views={views} onDone={onClose} /> : null}
    </Sheet>
  );
}

function RequestForm({ target, views, onDone }: { target: RequestTarget; views: ItemView[]; onDone: () => void }) {
  const toast = useToast();
  const { user } = useSession();
  const existing = views.find((v) => v.item.id === (target.request?.item_id ?? target.itemId));
  const [name, setName] = useState(existing?.item.name ?? "");
  const [unit, setUnit] = useState(existing?.item.unit ?? "kg");
  const [category, setCategory] = useState(existing?.item.category ?? "");
  const suggested = target.request?.qty ?? existing?.prediction.suggestedQty ?? existing?.item.default_qty ?? "";
  const [qty, setQty] = useState(suggested === null ? "" : String(Number(suggested) || ""));
  const [urgent, setUrgent] = useState(target.request?.urgency === "urgent");
  const [note, setNote] = useState(target.request?.note ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const match = useMemo(() => {
    const n = name.trim().toLowerCase();
    return n ? views.find((v) => v.item.name.toLowerCase() === n) : undefined;
  }, [name, views]);
  const preset = COMMON_ITEMS.find(([n]) => n.toLowerCase() === name.trim().toLowerCase());
  const known = match ?? existing;
  const unitShown = known?.item.unit ?? unit;

  const suggestions = useMemo(() => {
    const names = new Set(views.filter((v) => !v.item.is_archived).map((v) => v.item.name));
    for (const [n] of COMMON_ITEMS) names.add(n);
    return [...names];
  }, [views]);

  const quickPicks = useMemo(() => {
    const onList = new Set(views.filter((v) => v.openRequest).map((v) => v.item.id));
    const learned = views
      .filter((v) => !v.item.is_archived && !onList.has(v.item.id))
      .sort((a, b) => b.purchases.length - a.purchases.length)
      .map((v) => v.item.name);
    const commons = COMMON_ITEMS.map(([n]) => n).filter((n) => !views.some((v) => v.item.name === n && onList.has(v.item.id)));
    return [...new Set([...learned, ...commons])].slice(0, 12);
  }, [views]);

  function pick(n: string) {
    setName(n);
    const v = views.find((x) => x.item.name.toLowerCase() === n.toLowerCase());
    const p = COMMON_ITEMS.find(([x]) => x.toLowerCase() === n.toLowerCase());
    if (v) {
      setUnit(v.item.unit);
      const s = v.prediction.suggestedQty ?? v.item.default_qty;
      if (s && !qty) setQty(String(Number(s)));
    } else if (p) {
      setUnit(p[1]);
      setCategory(p[2]);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = qty.trim() === "" ? null : Number(qty);
    if (q !== null && (!Number.isFinite(q) || q <= 0)) return setError("Quantity must be a positive number");
    if (!target.request && !name.trim()) return setError("What do you need?");
    setError(null);
    setBusy("save");
    try {
      if (target.request) {
        await updateRequest(target.request.id, { qty: q, urgency: urgent ? "urgent" : "normal", note: note.trim() || null });
        toast.success("Updated");
      } else {
        await requestItem({
          itemId: known?.item.id ?? null,
          name: name.trim(),
          unit: known ? undefined : (preset?.[1] ?? unit),
          category: known ? undefined : category || preset?.[2] || undefined,
          qty: q,
          urgency: urgent ? "urgent" : "normal",
          note,
        });
        toast.success(`${name.trim()} added to the list`);
      }
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!target.request || !user) return;
    setBusy("remove");
    try {
      await cancelRequest(target.request.id, user.id);
      toast.show("Removed from the list");
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {target.request || target.itemId ? (
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-3">
          {existing ? <ItemImage item={existing.item} /> : null}
          <p className="min-w-0">
            <span className="block truncate text-[17px] font-semibold">{existing?.item.name_bn ?? existing?.item.name}</span>
            {existing?.item.name_bn ? <span className="block truncate text-[13px] text-ink-3">{existing.item.name}</span> : null}
          </p>
        </div>
      ) : (
        <>
          <Field label="Item" htmlFor="req-name">
            <Input
              id="req-name"
              list="req-suggestions"
              value={name}
              onChange={(e) => pick(e.target.value)}
              placeholder="e.g. Rice"
              autoComplete="off"
              data-autofocus
            />
            <datalist id="req-suggestions">
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          {!name ? (
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
              {quickPicks.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pick(n)}
                  className="h-9 shrink-0 rounded-full bg-surface-2 px-3.5 text-[13px] font-medium text-ink-2 transition hover:bg-surface-3"
                >
                  {n}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity (optional)" htmlFor="req-qty">
          <Input id="req-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 5" />
        </Field>
        <Field label="Unit" htmlFor="req-unit" hint={known ? "Set for this item" : undefined}>
          <Select id="req-unit" value={unitShown} disabled={Boolean(known)} onChange={(e) => setUnit(e.target.value)}>
            {[...new Set([unitShown, ...UNITS])].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!known && !target.request && name.trim() ? (
        <Field label="Category" htmlFor="req-cat">
          <Select id="req-cat" value={category || preset?.[2] || ""} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose…</option>
            {ITEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {known && known.prediction.suggestedQty ? (
        <p className="text-[12.5px] text-ink-3">
          You usually buy {formatQty(known.prediction.suggestedQty, known.item.unit)}
          {known.prediction.daysPerUsualQty ? `, which lasts about ${Math.round(known.prediction.daysPerUsualQty)} days` : ""}.
        </p>
      ) : null}

      <label className={cn("flex items-center justify-between gap-3 rounded-2xl px-4 py-3", urgent ? "bg-negative-soft" : "bg-surface-2")}>
        <span className="text-[14px]">
          Urgent
          <span className="block text-[12px] text-ink-3">Needed today — sends a highlighted alert</span>
        </span>
        <Switch checked={urgent} onChange={setUrgent} label="Urgent" />
      </label>

      <Field label="Note" htmlFor="req-note">
        <Textarea id="req-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Brand, size… (optional)" />
      </Field>

      {error ? <p role="alert" className="text-[13px] text-negative">{error}</p> : null}

      <div className="flex gap-3">
        {target.request ? (
          <Button variant="danger" size="icon" className="h-[52px] w-[52px] rounded-2xl" aria-label="Remove from list" onClick={remove} loading={busy === "remove"}>
            <Trash2 className="h-5 w-5" />
          </Button>
        ) : null}
        <Button type="submit" size="lg" className="flex-1" loading={busy === "save"}>
          {target.request ? "Save" : "Add to list"}
        </Button>
      </div>
      {!target.request ? <p className="text-center text-[12px] text-ink-3">Everyone in the household is notified right away.</p> : null}
    </form>
  );
}

export { formatQty };
