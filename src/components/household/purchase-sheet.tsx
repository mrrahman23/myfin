"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { AmountInput, Button, Field, Input, Select, Switch } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { isValidISODate } from "@/lib/dates";
import { errorMessage } from "@/lib/data/errors";
import { useCategories, useCurrency, usePaymentMethods, useSettings, useToday } from "@/lib/data/hooks";
import type { ItemView } from "@/lib/household/hooks";
import { recordPurchase } from "@/lib/household/mutations";
import { formatQty } from "@/lib/household/predict";
import { currencySymbol, formatMoney, parseAmount } from "@/lib/money";

export function PurchaseSheet({ view, stores, onClose }: { view: ItemView | null; stores: string[]; onClose: () => void }) {
  return (
    <Sheet
      open={Boolean(view)}
      onClose={onClose}
      title="Mark as bought"
      description={view ? (view.item.name_bn ? `${view.item.name} · ${view.item.name_bn}` : view.item.name) : undefined}
    >
      {view ? <PurchaseForm key={view.item.id} view={view} stores={stores} onDone={onClose} /> : null}
    </Sheet>
  );
}

function PurchaseForm({ view, stores, onDone }: { view: ItemView; stores: string[]; onDone: () => void }) {
  const toast = useToast();
  const today = useToday();
  const currency = useCurrency();
  const { data: settings } = useSettings();
  const { data: categories } = useCategories();
  const { data: methods } = usePaymentMethods();
  const finance = settings?.finance_enabled !== false;
  const initialQty = view.openRequest?.qty ?? view.prediction.suggestedQty ?? view.item.default_qty ?? "";
  const [qty, setQty] = useState(initialQty === null || initialQty === "" ? "" : String(Number(initialQty)));
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(today);
  const [store, setStore] = useState(view.purchases[0]?.store ?? "");
  const [addExpense, setAddExpense] = useState(finance);
  const groceries = categories?.find((c) => c.kind === "expense" && c.name.toLowerCase() === "groceries");
  const [categoryId, setCategoryId] = useState<string>("");
  const [methodId, setMethodId] = useState<string>("");
  const [clientRef] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = Number(qty);
  const total = price.trim() ? parseAmount(price) : null;
  const unitPrice = total !== null && q > 0 ? Math.round(total / q) : null;
  const last = view.price.lastUnitPrice;
  const diff = unitPrice !== null && last ? (unitPrice - last) / last : null;

  const expenseCategories = useMemo(() => (categories ?? []).filter((c) => c.kind === "expense" && !c.is_archived), [categories]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!(q > 0)) return setError("Enter how much you bought");
    if (price.trim() && (total === null || total < 0)) return setError("Enter a valid price");
    if (!isValidISODate(date)) return setError("Choose a valid date");
    setError(null);
    setSaving(true);
    try {
      await recordPurchase({
        itemId: view.item.id,
        qty: q,
        totalPrice: total,
        date,
        store,
        addExpense: finance && addExpense && (total ?? 0) > 0,
        categoryId: categoryId || groceries?.id || null,
        paymentMethodId: methodId || null,
        clientRef,
      });
      toast.success(`${view.item.name} bought${total ? ` · ${formatMoney(total, { currency })}` : ""}`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Quantity (${view.item.unit})`} htmlFor="pur-qty">
          <Input id="pur-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} data-autofocus />
        </Field>
        <Field label="Total price" htmlFor="pur-price">
          <AmountInput id="pur-price" symbol={currencySymbol(currency)} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
        </Field>
      </div>

      {unitPrice !== null ? (
        <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-[13px]">
          <span className="text-ink-2">
            {formatMoney(unitPrice, { currency })} per {view.item.unit}
          </span>
          {diff !== null && Math.abs(diff) >= 0.01 ? (
            <span className={cn("flex items-center gap-1 font-semibold", diff > 0 ? "text-negative" : "text-positive")}>
              {diff > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {Math.round(Math.abs(diff) * 100)}% {diff > 0 ? "dearer" : "cheaper"} than last time
            </span>
          ) : last ? (
            <span className="text-ink-3">Same as last time</span>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="pur-date">
          <Input id="pur-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Shop (optional)" htmlFor="pur-store">
          <Input id="pur-store" list="pur-stores" value={store} onChange={(e) => setStore(e.target.value)} placeholder="e.g. Shwapno" />
          <datalist id="pur-stores">
            {stores.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
      </div>

      {finance ? (
        <div className="space-y-3 rounded-2xl bg-surface-2 p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-[14px]">
              Add to my expenses
              <span className="block text-[12px] text-ink-3">Recorded in your private finance ledger</span>
            </span>
            <Switch checked={addExpense} onChange={setAddExpense} label="Add to my expenses" />
          </label>
          {addExpense ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category" htmlFor="pur-cat">
                <Select id="pur-cat" value={categoryId || groceries?.id || ""} onChange={(e) => setCategoryId(e.target.value)}>
                  {!groceries ? <option value="">Groceries (new)</option> : null}
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Paid with" htmlFor="pur-method">
                <Select id="pur-method" value={methodId || methods?.find((m) => m.is_default)?.id || ""} onChange={(e) => setMethodId(e.target.value)}>
                  {(methods ?? []).filter((m) => !m.is_archived).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p role="alert" className="text-[13px] text-negative">{error}</p> : null}
      <Button type="submit" size="lg" loading={saving}>
        Bought {q > 0 ? formatQty(q, view.item.unit) : ""}
      </Button>
    </form>
  );
}
