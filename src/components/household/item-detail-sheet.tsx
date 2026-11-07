"use client";

import { Archive, ArchiveRestore, Pencil, ShoppingCart, Trash2 } from "lucide-react";
import { useState } from "react";
import { Money } from "@/components/ui/money";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { ConfirmSheet, Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { errorMessage } from "@/lib/data/errors";
import { useToday } from "@/lib/data/hooks";
import type { ItemView } from "@/lib/household/hooks";
import { deletePurchase, updateItem } from "@/lib/household/mutations";
import { formatDuration, formatQty } from "@/lib/household/predict";
import { ITEM_CATEGORIES, UNITS, type HouseholdMember, type HouseholdPurchase } from "@/lib/household/types";
import { toMinor } from "@/lib/money";
import { StockPill } from "./stock";

export function ItemDetailSheet({
  view,
  members,
  onClose,
  onAddToList,
  onBought,
}: {
  view: ItemView | null;
  members: HouseholdMember[];
  onClose: () => void;
  onAddToList: (v: ItemView) => void;
  onBought: (v: ItemView) => void;
}) {
  const [editing, setEditing] = useState(false);
  const close = () => {
    setEditing(false);
    onClose();
  };
  return (
    <Sheet open={Boolean(view)} onClose={close} title={view?.item.name ?? ""} description={view?.item.category ?? undefined}>
      {view ? (
        editing ? (
          <EditItem view={view} onDone={() => setEditing(false)} />
        ) : (
          <Details view={view} members={members} onEdit={() => setEditing(true)} onAddToList={onAddToList} onBought={onBought} />
        )
      ) : null}
    </Sheet>
  );
}

function Details({
  view,
  members,
  onEdit,
  onAddToList,
  onBought,
}: {
  view: ItemView;
  members: HouseholdMember[];
  onEdit: () => void;
  onAddToList: (v: ItemView) => void;
  onBought: (v: ItemView) => void;
}) {
  const toast = useToast();
  const today = useToday();
  const [removing, setRemoving] = useState<HouseholdPurchase | null>(null);
  const { prediction: p, price, item } = view;
  const year = +today.slice(0, 4);
  const who = (id: string | null) => members.find((m) => m.user_id === id)?.display_name ?? "";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-surface-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">Stock forecast</p>
          <StockPill view={view} />
        </div>
        {p.status === "learning" ? (
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
            Record a couple of purchases (or mark it running low when it does) and myFin will learn how long {formatQty(p.suggestedQty ?? 1, item.unit)} lasts.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[22px] font-bold tracking-[-0.02em]">
              {view.openRequest ? "On the shopping list" : p.daysLeft !== null && p.daysLeft > 0 ? `~${p.daysLeft} days left` : "Probably finished"}
            </p>
            <p className="text-[13px] text-ink-2">
              {p.suggestedQty ? `${formatQty(p.suggestedQty, item.unit)} lasts ${formatDuration(p.daysPerUsualQty)}` : ""}
              {p.runOutDate && !view.openRequest ? ` · runs out around ${formatDate(p.runOutDate, year)}` : ""}
            </p>
            {p.dailyUse ? (
              <p className="mt-1 text-[12px] text-ink-3">
                Using about {formatQty(Math.round(p.dailyUse * 7 * 100) / 100, item.unit)} a week · confidence {Math.round(p.confidence * 100)}%
              </p>
            ) : null}
          </>
        )}
      </div>

      {price.lastUnitPrice !== null ? (
        <dl className="grid grid-cols-2 gap-3 text-[13px]">
          <div className="rounded-2xl border border-line p-3">
            <dt className="text-ink-3">Last price</dt>
            <dd className="mt-0.5 font-semibold">
              <Money value={price.lastUnitPrice} />/{item.unit}
            </dd>
            {price.change !== null && Math.abs(price.change) >= 0.01 ? (
              <dd className={cn("text-[12px] font-medium", price.change > 0 ? "text-negative" : "text-positive")}>
                {price.change > 0 ? "▲" : "▼"} {Math.round(Math.abs(price.change) * 100)}% vs before
              </dd>
            ) : null}
          </div>
          <div className="rounded-2xl border border-line p-3">
            <dt className="text-ink-3">Cheapest</dt>
            <dd className="mt-0.5 font-semibold">
              <Money value={price.cheapest!.unitPrice} />/{item.unit}
            </dd>
            <dd className="truncate text-[12px] text-ink-3">
              {price.cheapest!.store ?? "—"} · {formatDate(price.cheapest!.date, year)}
            </dd>
          </div>
          <div className="col-span-2 flex justify-between rounded-2xl border border-line p-3">
            <dt className="text-ink-3">Spent in the last year</dt>
            <dd className="font-semibold">
              <Money value={price.totalSpent} />
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => onAddToList(view)} disabled={Boolean(view.openRequest)}>
          <ShoppingCart className="h-4 w-4" /> {view.openRequest ? "On list" : "Add to list"}
        </Button>
        <Button onClick={() => onBought(view)}>Mark bought</Button>
      </div>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Purchase history</h3>
        {view.purchases.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-ink-3">No purchases yet.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {view.purchases.map((pu) => (
              <li key={pu.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">
                    {formatQty(pu.qty, item.unit)}
                    {pu.total_price !== null ? (
                      <span className="font-normal text-ink-3">
                        {" "}
                        · <Money value={toMinor(pu.total_price)} /> (<Money value={Math.round(toMinor(pu.total_price) / Number(pu.qty))} />/{item.unit})
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[12px] text-ink-3">
                    {formatDate(pu.purchased_on, year)}
                    {pu.store ? ` · ${pu.store}` : ""}
                    {who(pu.purchased_by) ? ` · ${who(pu.purchased_by)}` : ""}
                  </p>
                </div>
                <button type="button" aria-label="Delete purchase" onClick={() => setRemoving(pu)} className="grid h-9 w-9 place-items-center rounded-full text-ink-3 hover:bg-negative-soft hover:text-negative">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Button variant="ghost" className="w-full" onClick={onEdit}>
        <Pencil className="h-4 w-4" /> Edit item
      </Button>

      <ConfirmSheet
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        destructive
        confirmLabel="Delete"
        title="Delete this purchase?"
        body={removing?.transaction_id ? "It is removed from the household history. The expense in your finance ledger is kept — delete it in Transactions if needed." : "It is removed from the household history and forecasts."}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await deletePurchase(removing.id);
            toast.show("Purchase deleted");
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setRemoving(null);
          }
        }}
      />
    </div>
  );
}

function EditItem({ view, onDone }: { view: ItemView; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(view.item.name);
  const [unit, setUnit] = useState(view.item.unit);
  const [category, setCategory] = useState(view.item.category ?? "");
  const [busy, setBusy] = useState(false);

  async function save(patch: Parameters<typeof updateItem>[1], message: string) {
    setBusy(true);
    try {
      await updateItem(view.item.id, patch);
      toast.success(message);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return toast.error("Name is required");
        void save({ name: name.trim(), unit, category: category || null }, "Item updated");
      }}
    >
      <Field label="Name" htmlFor="it-name">
        <Input id="it-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit" htmlFor="it-unit" hint={view.purchases.length ? "Changing it doesn't convert past purchases" : undefined}>
          <Select id="it-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {[...new Set([unit, ...UNITS])].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="it-cat">
          <Select id="it-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">None</option>
            {[...new Set([...(category ? [category] : []), ...ITEM_CATEGORIES])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          onClick={() => save({ is_archived: !view.item.is_archived }, view.item.is_archived ? "Item restored" : "Item archived")}
          disabled={busy}
        >
          {view.item.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {view.item.is_archived ? "Restore" : "Archive"}
        </Button>
        <Button type="submit" loading={busy}>
          Save
        </Button>
      </div>
      <p className="text-[12px] text-ink-3">Archived items are hidden from the pantry and forecasts. History is kept.</p>
    </form>
  );
}
