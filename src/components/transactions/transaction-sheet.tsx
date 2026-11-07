"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { AmountInput, Button, Field, Input, Segmented, Select, Textarea } from "@/components/ui/primitives";
import { ConfirmSheet, Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { isValidISODate, monthLabel, periodOf } from "@/lib/dates";
import { errorMessage } from "@/lib/data/errors";
import { useCategories, useCurrency, useMonthData, usePaymentMethods, useToday } from "@/lib/data/hooks";
import { deleteTransaction, refreshAll, restoreTransaction, saveTransaction } from "@/lib/data/mutations";
import { currencySymbol, formatMoney, parseAmount, toMinor } from "@/lib/money";
import type { Transaction, TransactionKind } from "@/lib/types";

const schema = z
  .object({
    kind: z.enum(["income", "expense", "transfer", "adjustment"]),
    direction: z.enum(["in", "out"]),
    amount: z.string().min(1, "Enter an amount"),
    txn_date: z.string().refine(isValidISODate, "Choose a valid date"),
    category_id: z.string(),
    obligation_id: z.string(),
    payment_method_id: z.string(),
    to_payment_method_id: z.string(),
    description: z.string().max(200, "Keep it under 200 characters"),
    notes: z.string().max(1000, "Keep it under 1,000 characters"),
  })
  .superRefine((v, ctx) => {
    const minor = parseAmount(v.amount);
    if (minor === null) ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter a valid amount (up to 2 decimals)" });
    else if (minor <= 0) ctx.addIssue({ code: "custom", path: ["amount"], message: "Amount must be greater than zero" });
    else if (minor > 99_999_999_999_99) ctx.addIssue({ code: "custom", path: ["amount"], message: "That amount is too large" });
    if (v.kind === "transfer") {
      if (!v.payment_method_id || !v.to_payment_method_id)
        ctx.addIssue({ code: "custom", path: ["to_payment_method_id"], message: "Choose both accounts" });
      else if (v.payment_method_id === v.to_payment_method_id)
        ctx.addIssue({ code: "custom", path: ["to_payment_method_id"], message: "Choose two different accounts" });
    }
  });

type FormValues = z.infer<typeof schema>;

export interface TransactionPreset {
  kind?: TransactionKind;
  obligationId?: string;
  categoryId?: string;
}

const KIND_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "adjustment", label: "Adjust" },
] as const;

export function TransactionSheet({
  open,
  onClose,
  transaction,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  transaction?: Transaction | null;
  preset?: TransactionPreset;
}) {
  const editing = Boolean(transaction);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit transaction" : preset?.kind === "income" ? "Add income" : preset?.kind === "expense" ? "Add expense" : "New transaction"}
    >
      {open ? <TransactionForm key={transaction?.id ?? "new"} transaction={transaction ?? null} preset={preset} onDone={onClose} /> : null}
    </Sheet>
  );
}

function TransactionForm({
  transaction,
  preset,
  onDone,
}: {
  transaction: Transaction | null;
  preset?: TransactionPreset;
  onDone: () => void;
}) {
  const toast = useToast();
  const today = useToday();
  const currency = useCurrency();
  const { data: categories } = useCategories();
  const { data: methods } = usePaymentMethods();
  const [clientRef] = useState(() => crypto.randomUUID());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const defaultMethod = methods?.find((m) => m.is_default)?.id ?? "";
  const initialAmount = transaction ? toMinor(transaction.amount) : 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: transaction?.kind ?? preset?.kind ?? "expense",
      direction: initialAmount < 0 ? "out" : "in",
      amount: transaction ? String(Math.abs(initialAmount) / 100) : "",
      txn_date: transaction?.txn_date ?? today,
      category_id: transaction?.category_id ?? preset?.categoryId ?? "",
      obligation_id: transaction?.obligation_id ?? preset?.obligationId ?? "",
      payment_method_id: transaction?.payment_method_id ?? defaultMethod,
      to_payment_method_id: transaction?.to_payment_method_id ?? "",
      description: transaction?.description ?? "",
      notes: transaction?.notes ?? "",
    },
  });
  const { register, handleSubmit, control, setValue, formState } = form;
  const [kind, date, categoryId, obligationId, paymentMethodId] = useWatch({
    control,
    name: ["kind", "txn_date", "category_id", "obligation_id", "payment_method_id"],
  });

  useEffect(() => {
    if (!paymentMethodId && defaultMethod && !transaction) setValue("payment_method_id", defaultMethod);
  }, [defaultMethod, paymentMethodId, setValue, transaction]);

  const period = isValidISODate(date) ? periodOf(date) : periodOf(today);
  const month = useMonthData(period);
  const entryKind = kind === "income" || kind === "expense" ? kind : null;

  const kindCategories = useMemo(
    () => (categories ?? []).filter((c) => c.kind === entryKind && (!c.is_archived || c.id === categoryId)),
    [categories, entryKind, categoryId],
  );
  const linkable = useMemo(() => {
    if (!month.data || !entryKind) return [];
    return [...month.data.monthRows, ...month.data.carried].filter(
      (r) => r.kind === entryKind && (!categoryId || r.category_id === categoryId),
    );
  }, [month.data, entryKind, categoryId]);

  // keep the link consistent with kind/category
  useEffect(() => {
    if (!obligationId || !month.data) return;
    const all = [...month.data.monthRows, ...month.data.carried];
    const linked = all.find((r) => r.id === obligationId);
    if (linked && (linked.kind !== entryKind || (categoryId && linked.category_id !== categoryId))) {
      setValue("obligation_id", "");
    }
  }, [entryKind, categoryId, obligationId, month.data, setValue]);

  const groupedCategories = useMemo(() => {
    const groups = new Map<string, typeof kindCategories>();
    for (const c of kindCategories) {
      const g = c.group_name || "Other";
      groups.set(g, [...(groups.get(g) ?? []), c]);
    }
    return [...groups.entries()];
  }, [kindCategories]);

  const onSubmit = handleSubmit(async (v) => {
    const minor = parseAmount(v.amount)!;
    const amount = v.kind === "adjustment" && v.direction === "out" ? -minor : minor;
    const linkedRow = linkable.find((r) => r.id === v.obligation_id);
    try {
      await saveTransaction(
        {
          kind: v.kind,
          amount,
          txn_date: v.txn_date,
          category_id: entryKind ? v.category_id || linkedRow?.category_id || null : null,
          payment_method_id: v.payment_method_id || null,
          to_payment_method_id: v.to_payment_method_id || null,
          obligation_id: entryKind ? v.obligation_id || null : null,
          description: v.description || linkedRow?.name || "",
          notes: v.notes,
        },
        transaction?.id,
        clientRef,
      );
      await refreshAll();
      toast.success(transaction ? "Transaction updated" : "Transaction added");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  async function onDelete() {
    if (!transaction) return;
    setDeleting(true);
    try {
      await deleteTransaction(transaction.id);
      await refreshAll();
      setConfirmDelete(false);
      onDone();
      toast.success("Transaction deleted", {
        label: "Undo",
        onClick: async () => {
          try {
            await restoreTransaction(transaction);
            await refreshAll();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  const activeMethods = (methods ?? []).filter((m) => !m.is_archived || m.id === paymentMethodId);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Controller
        control={control}
        name="kind"
        render={({ field }) => (
          <Segmented
            className="w-full"
            value={field.value}
            onChange={(k) => field.onChange(k)}
            options={KIND_OPTIONS}
          />
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" error={formState.errors.amount?.message} htmlFor="amount">
          <AmountInput id="amount" symbol={currencySymbol(currency)} placeholder="0" data-autofocus {...register("amount")} />
        </Field>
        <Field label="Date" error={formState.errors.txn_date?.message} htmlFor="txn_date">
          <Input id="txn_date" type="date" {...register("txn_date")} />
        </Field>
      </div>

      {kind === "adjustment" ? (
        <Controller
          control={control}
          name="direction"
          render={({ field }) => (
            <Segmented
              className="w-full"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "in", label: "Increase balance" },
                { value: "out", label: "Decrease balance" },
              ]}
            />
          )}
        />
      ) : null}

      <Field label="Description" error={formState.errors.description?.message} htmlFor="description">
        <Input id="description" placeholder={kind === "income" ? "e.g. Freelance project" : "e.g. Groceries"} {...register("description")} />
      </Field>

      {entryKind ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category_id">
            <Select id="category_id" {...register("category_id")}>
              <option value="">Uncategorised</option>
              {groupedCategories.map(([group, list]) => (
                <optgroup key={group} label={group}>
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field
            label="Monthly item"
            htmlFor="obligation_id"
            hint={obligationId ? "This payment will settle the item (oldest balance first)." : `Optional — items in ${monthLabel(period)}`}
          >
            <Select id="obligation_id" {...register("obligation_id")}>
              <option value="">Not linked</option>
              {linkable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.period !== period ? ` (${monthLabel(r.period, "short")})` : ""} —{" "}
                  {formatMoney(Math.max(0, toMinor(r.outstanding) + toMinor(r.carried_in)), { currency })} due
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={kind === "transfer" ? "From account" : "Payment method"} htmlFor="payment_method_id">
          <Select id="payment_method_id" {...register("payment_method_id")}>
            <option value="">None</option>
            {activeMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        {kind === "transfer" ? (
          <Field label="To account" htmlFor="to_payment_method_id" error={formState.errors.to_payment_method_id?.message}>
            <Select id="to_payment_method_id" {...register("to_payment_method_id")}>
              <option value="">Choose…</option>
              {activeMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      <Field label="Notes" error={formState.errors.notes?.message} htmlFor="notes">
        <Textarea id="notes" rows={2} placeholder="Optional" {...register("notes")} />
      </Field>

      <div className="flex gap-3 pt-1">
        {transaction ? (
          <Button variant="danger" size="icon" aria-label="Delete transaction" onClick={() => setConfirmDelete(true)} className="h-[52px] w-[52px] rounded-2xl">
            <Trash2 className="h-5 w-5" />
          </Button>
        ) : null}
        <Button type="submit" size="lg" loading={formState.isSubmitting} className="flex-1">
          {transaction ? "Save changes" : "Add transaction"}
        </Button>
      </div>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        loading={deleting}
        destructive
        title="Delete transaction?"
        confirmLabel="Delete"
        body={
          transaction?.obligation_id
            ? "This payment will be removed and the linked item will show the amount as outstanding again."
            : "This permanently removes the transaction from your ledger."
        }
      />
    </form>
  );
}
