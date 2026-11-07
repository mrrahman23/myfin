"use client";

import { ArrowRight, CalendarClock, Pencil, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Money } from "@/components/ui/money";
import { AmountInput, Button, Field, Input, Pill, Select, Skeleton, Switch, Textarea } from "@/components/ui/primitives";
import { ConfirmSheet, Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatDate, isValidISODate, monthLabel, relativeDue } from "@/lib/dates";
import { errorMessage } from "@/lib/data/errors";
import { useCategories, useCurrency, useObligationHistory, usePaymentMethods, useToday } from "@/lib/data/hooks";
import {
  deleteObligation,
  deleteTransaction,
  markPaid,
  recordPayment,
  refreshAll,
  restoreTransaction,
  updateBudget,
  updateObligation,
} from "@/lib/data/mutations";
import { STATE_LABEL, type LineItem } from "@/lib/finance/summary";
import { currencySymbol, formatMoney, parseAmount } from "@/lib/money";

type Mode = "view" | "pay" | "edit";

export function ItemSheet({ item, onClose }: { item: LineItem | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("view");
  const shown = item;

  const close = () => {
    setMode("view");
    onClose();
  };

  return (
    <Sheet
      open={Boolean(item)}
      onClose={close}
      title={shown ? (mode === "pay" ? (shown.kind === "income" ? "Record receipt" : "Record payment") : mode === "edit" ? "Edit item" : shown.name) : ""}
      description={
        shown && mode === "view" ? (
          <span>
            {shown.categoryName}
            {shown.group ? ` · ${shown.group}` : ""} · {monthLabel(shown.period)}
          </span>
        ) : shown && mode !== "view" ? (
          shown.name
        ) : null
      }
    >
      {shown ? (
        mode === "pay" ? (
          <PaymentForm item={shown} onDone={() => setMode("view")} />
        ) : mode === "edit" ? (
          <EditItemForm item={shown} onDone={() => setMode("view")} onDeleted={close} />
        ) : (
          <ItemDetails item={shown} onPay={() => setMode("pay")} onEdit={() => setMode("edit")} />
        )
      ) : null}
    </Sheet>
  );
}

function ItemDetails({ item, onPay, onEdit }: { item: LineItem; onPay: () => void; onEdit: () => void }) {
  const toast = useToast();
  const today = useToday();
  const currency = useCurrency();
  const [settling, setSettling] = useState(false);
  const [actual, setActual] = useState(item.hasActual ? String(item.charge / 100) : "");
  const [savingActual, setSavingActual] = useState(false);
  const isIncome = item.kind === "income";
  const year = +today.slice(0, 4);

  async function settle() {
    setSettling(true);
    try {
      const txnId = await markPaid(item.id);
      await refreshAll();
      toast.success(`${item.name} ${isIncome ? "received" : "paid"}`, {
        label: "Undo",
        onClick: async () => {
          await deleteTransaction(txnId);
          await refreshAll();
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSettling(false);
    }
  }

  async function saveActual(value: string) {
    const minor = value.trim() === "" ? null : parseAmount(value);
    if (value.trim() !== "" && (minor === null || minor < 0)) {
      toast.error("Enter a valid amount");
      return;
    }
    setSavingActual(true);
    try {
      await updateObligation(item.id, { actual_amount: minor });
      await refreshAll();
      toast.success(minor === null ? "Using budget amount" : "Actual amount updated");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSavingActual(false);
    }
  }

  const stateTone = item.state === "paid" ? "positive" : item.state === "partial" ? "warning" : item.overdue ? "negative" : "neutral";
  const actualDirty = actual !== (item.hasActual ? String(item.charge / 100) : "");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-2xl bg-surface-2 p-4">
        <CategoryIcon icon={item.icon} kind={item.kind} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">
            {item.state === "paid" ? (isIncome ? "Received" : "Paid") : isIncome ? "To receive" : "Due now"}
          </p>
          <Money value={item.state === "paid" ? item.paid : item.totalDue} className="block text-[28px] font-bold tracking-[-0.03em]" />
        </div>
        <Pill tone={stateTone}>{STATE_LABEL[item.kind][item.state]}</Pill>
      </div>

      <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line text-[14px]">
        <Row label="Budget" value={<Money value={item.budget} />} />
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-ink-2">
            Actual {isIncome ? "amount" : "bill"}
            <span className="block text-[11.5px] text-ink-3">Leave empty to use the budget</span>
          </dt>
          <dd className="flex items-center gap-2">
            <div className="w-[130px]">
              <AmountInput
                aria-label="Actual amount"
                symbol={currencySymbol(currency)}
                value={actual}
                placeholder={String(item.budget / 100)}
                onChange={(e) => setActual(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && actualDirty && saveActual(actual)}
                className="h-10 text-[15px]"
              />
            </div>
            {actualDirty ? (
              <Button size="sm" onClick={() => saveActual(actual)} loading={savingActual}>
                Save
              </Button>
            ) : null}
          </dd>
        </div>
        {item.hasActual ? (
          <Row
            label="Variance"
            value={
              <span className={cn("font-semibold", item.variance === 0 ? "" : (isIncome ? item.variance < 0 : item.variance > 0) ? "text-negative" : "text-positive")}>
                {formatMoney(item.variance, { currency, signed: true })}
              </span>
            }
          />
        ) : null}
        {item.carriedIn > 0 ? (
          <Row label="Carried from earlier months" value={<Money value={item.carriedIn} className="font-semibold text-warning" />} />
        ) : null}
        <Row label={isIncome ? "Received on this item" : "Paid on this item"} value={<Money value={item.paid} />} />
        <Row
          label="Outstanding"
          value={<Money value={Math.max(0, item.ownOutstanding)} className="font-semibold" />}
        />
        {item.ownOutstanding < 0 ? <Row label="Overpaid (credit)" value={<Money value={-item.ownOutstanding} />} /> : null}
        <Row
          label="Due date"
          value={
            item.dueDate ? (
              <span className={cn(item.overdue && "font-semibold text-negative")}>
                {formatDate(item.dueDate, year)}
                {item.state !== "paid" ? <span className="ml-1 text-ink-3">· {relativeDue(item.dueDate, today)}</span> : null}
              </span>
            ) : (
              "—"
            )
          }
        />
      </dl>

      {item.row.notes ? <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[14px] text-ink-2">{item.row.notes}</p> : null}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onPay}>
          {isIncome ? "Partial receipt" : "Partial payment"}
        </Button>
        <Button onClick={settle} loading={settling} disabled={item.totalDue <= 0}>
          {item.totalDue <= 0 ? (isIncome ? "Received" : "Paid") : `${isIncome ? "Receive" : "Pay"} ${formatMoney(item.totalDue, { currency, compact: item.totalDue >= 10_000_000 })}`}
        </Button>
      </div>

      <PaymentTimeline obligationId={item.id} kind={item.kind} />

      <Button variant="ghost" className="w-full" onClick={onEdit}>
        <Pencil className="h-4 w-4" /> Edit item, budget or due date
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-right tabular">{value}</dd>
    </div>
  );
}

function PaymentTimeline({ obligationId, kind }: { obligationId: string; kind: "income" | "expense" }) {
  const { data, isLoading } = useObligationHistory(obligationId);
  const { data: methods } = usePaymentMethods();
  const today = useToday();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const year = +today.slice(0, 4);

  async function remove(t: NonNullable<typeof data>["entries"][number]["transaction"]) {
    setBusy(t.id);
    try {
      await deleteTransaction(t.id);
      await refreshAll();
      toast.success("Payment removed", {
        label: "Undo",
        onClick: async () => {
          await restoreTransaction(t);
          await refreshAll();
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">
        <CalendarClock className="h-4 w-4" /> {kind === "income" ? "Receipt" : "Payment"} history
      </h3>
      {isLoading ? (
        <Skeleton className="h-16" />
      ) : !data?.entries.length ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-ink-3">
          Nothing recorded yet.
        </p>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-line pl-5">
          {data.entries.map(({ transaction: t, allocatedHere, splits, madeHere }) => (
            <li key={t.id} className="relative">
              <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-positive" aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium">
                    <Money value={allocatedHere} /> {madeHere ? "" : <span className="font-normal text-ink-3">from a later payment</span>}
                  </p>
                  <p className="text-[12.5px] text-ink-3">
                    {formatDate(t.txn_date, year)}
                    {t.payment_method_id ? ` · ${methods?.find((m) => m.id === t.payment_method_id)?.name ?? ""}` : ""}
                    {t.notes ? ` · ${t.notes}` : ""}
                  </p>
                  {splits.length > 1 ? (
                    <ul className="mt-1 space-y-0.5 text-[12px] text-ink-3">
                      {splits.map((s) => (
                        <li key={s.id} className="flex items-center gap-1">
                          <ArrowRight className="h-3 w-3" />
                          <Money value={Math.round(Number(s.amount) * 100)} /> to {s.obligation?.name ?? "item"}
                          {s.obligation ? ` · ${monthLabel(s.obligation.period, "short")}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {madeHere ? (
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    disabled={busy === t.id}
                    className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-negative hover:bg-negative-soft disabled:opacity-50"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Undo
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function PaymentForm({ item, onDone }: { item: LineItem; onDone: () => void }) {
  const toast = useToast();
  const today = useToday();
  const currency = useCurrency();
  const { data: methods } = usePaymentMethods();
  const [clientRef] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(item.totalDue > 0 ? String(item.totalDue / 100) : "");
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const methodValue = method || methods?.find((m) => m.is_default)?.id || "";
  const minor = parseAmount(amount);
  const remaining = minor !== null ? item.totalDue - minor : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (minor === null || minor <= 0) return setError("Enter an amount greater than zero");
    if (!isValidISODate(date)) return setError("Choose a valid date");
    setError(null);
    setSaving(true);
    try {
      await recordPayment({ obligationId: item.id, amount: minor, date, paymentMethodId: methodValue || null, notes, clientRef });
      await refreshAll();
      toast.success(`${formatMoney(minor, { currency })} ${item.kind === "income" ? "received" : "paid"} for ${item.name}`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-3 gap-2">
        {[0.25, 0.5, 1].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setAmount(String(Math.round(item.totalDue * f) / 100))}
            className="h-10 rounded-xl bg-surface-2 text-[13px] font-semibold text-ink-2 transition hover:bg-surface-3"
          >
            {f === 1 ? "Full" : `${f * 100}%`}
          </button>
        ))}
      </div>
      <Field label="Amount" error={error ?? undefined} htmlFor="pay-amount" hint={
        remaining !== null && remaining > 0
          ? `${formatMoney(remaining, { currency })} will remain outstanding${item.row.category_carry_forward ? " and carry forward" : ""}`
          : remaining !== null && remaining < 0
            ? `${formatMoney(-remaining, { currency })} more than due — recorded as credit`
            : undefined
      }>
        <AmountInput id="pay-amount" symbol={currencySymbol(currency)} value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus />
      </Field>
      {item.carriedIn > 0 ? (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-[12.5px] text-ink-2">
          Payments settle the oldest balance first: <Money value={item.carriedIn} /> carried from earlier months, then this month.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="pay-date">
          <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Method" htmlFor="pay-method">
          <Select id="pay-method" value={methodValue} onChange={(e) => setMethod(e.target.value)}>
            <option value="">None</option>
            {(methods ?? []).filter((m) => !m.is_archived).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Note" htmlFor="pay-notes">
        <Input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" maxLength={1000} />
      </Field>
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Button variant="secondary" onClick={onDone}>
          Back
        </Button>
        <Button type="submit" loading={saving}>
          Record
        </Button>
      </div>
    </form>
  );
}

function EditItemForm({ item, onDone, onDeleted }: { item: LineItem; onDone: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const currency = useCurrency();
  const { data: categories } = useCategories();
  const [name, setName] = useState(item.name);
  const [budget, setBudget] = useState(String(item.budget / 100));
  const [applyFuture, setApplyFuture] = useState(false);
  const [dueDate, setDueDate] = useState(item.dueDate ?? "");
  const [notes, setNotes] = useState(item.row.notes ?? "");
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const b = parseAmount(budget);
    if (!name.trim()) return setError("Name is required");
    if (b === null || b < 0) return setError("Enter a valid budget");
    if (dueDate && !isValidISODate(dueDate)) return setError("Choose a valid due date");
    setError(null);
    setSaving(true);
    try {
      await updateObligation(item.id, {
        name,
        due_date: dueDate || null,
        notes: notes.trim() || null,
        category_id: categoryId,
      });
      if (b !== item.budget || applyFuture) await updateBudget(item.id, b, applyFuture);
      await refreshAll();
      toast.success("Item updated");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await deleteObligation(item.id);
      await refreshAll();
      toast.success(`${item.name} removed from ${monthLabel(item.period)}`);
      onDeleted();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const options = (categories ?? []).filter((c) => c.kind === item.kind && (!c.is_archived || c.id === categoryId));

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Name" htmlFor="edit-name">
        <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Category" htmlFor="edit-cat">
        <Select id="edit-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Budget for ${monthLabel(item.period, "short")}`} htmlFor="edit-budget">
          <AmountInput id="edit-budget" symbol={currencySymbol(currency)} value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
        <Field label="Due date" htmlFor="edit-due">
          <Input id="edit-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
        <span className="text-[14px]">
          Also use this budget for later months
          <span className="block text-[12px] text-ink-3">Updates the recurring amount and every future month</span>
        </span>
        <Switch checked={applyFuture} onChange={setApplyFuture} label="Apply budget to future months" />
      </label>
      <Field label="Notes" htmlFor="edit-notes">
        <Textarea id="edit-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
      </Field>
      {error ? <p role="alert" className="text-[13px] text-negative">{error}</p> : null}
      <div className="flex gap-3 pt-1">
        <Button variant="danger" size="icon" aria-label="Delete item" className="h-11 w-11" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-[18px] w-[18px]" />
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={saving}>
          Save
        </Button>
      </div>
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={deleting}
        destructive
        confirmLabel="Remove"
        title={`Remove ${item.name}?`}
        body={
          item.paymentCount > 0
            ? `It has ${item.paymentCount} recorded payment${item.paymentCount === 1 ? "" : "s"}. They stay in your ledger as unlinked transactions, so your cash figures do not change.`
            : `It will be removed from ${monthLabel(item.period)} only. Recurring items won't be re-created for this month.`
        }
      />
    </form>
  );
}
