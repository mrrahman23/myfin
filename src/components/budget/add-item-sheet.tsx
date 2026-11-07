"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { AmountInput, Button, Field, Input, Segmented, Select, Textarea } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { dateInPeriod, isValidISODate, monthLabel } from "@/lib/dates";
import { errorMessage } from "@/lib/data/errors";
import { useCategories, useCurrency } from "@/lib/data/hooks";
import { createObligation, refreshAll } from "@/lib/data/mutations";
import { currencySymbol, parseAmount, toMinor } from "@/lib/money";

const schema = z
  .object({
    kind: z.enum(["expense", "income"]),
    category_id: z.string().min(1, "Choose a category"),
    name: z.string().trim().min(1, "Name is required").max(80),
    budget: z.string(),
    due_date: z.string(),
    notes: z.string().max(1000),
  })
  .superRefine((v, ctx) => {
    const m = parseAmount(v.budget);
    if (m === null || m < 0) ctx.addIssue({ code: "custom", path: ["budget"], message: "Enter a valid amount" });
    if (v.due_date && !isValidISODate(v.due_date)) ctx.addIssue({ code: "custom", path: ["due_date"], message: "Invalid date" });
  });
type Values = z.infer<typeof schema>;

export function AddItemSheet({
  open,
  onClose,
  period,
  defaultKind,
}: {
  open: boolean;
  onClose: () => void;
  period: string;
  defaultKind: "expense" | "income";
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Add item" description={`One-off item for ${monthLabel(period)}`}>
      {open ? <AddItemForm period={period} defaultKind={defaultKind} onDone={onClose} /> : null}
    </Sheet>
  );
}

function AddItemForm({ period, defaultKind, onDone }: { period: string; defaultKind: "expense" | "income"; onDone: () => void }) {
  const toast = useToast();
  const currency = useCurrency();
  const { data: categories } = useCategories();
  const { register, handleSubmit, control, setValue, getValues, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { kind: defaultKind, category_id: "", name: "", budget: "", due_date: "", notes: "" },
  });
  const [kind, categoryId] = useWatch({ control, name: ["kind", "category_id"] });
  const options = (categories ?? []).filter((c) => c.kind === kind && !c.is_archived);

  // prefill from the chosen category
  useEffect(() => {
    const c = categories?.find((x) => x.id === categoryId);
    if (!c) return;
    if (!getValues("name")) setValue("name", c.name);
    if (!getValues("budget")) setValue("budget", String(toMinor(c.default_budget) / 100));
    if (!getValues("due_date") && c.default_due_day) setValue("due_date", dateInPeriod(period, c.default_due_day));
  }, [categoryId, categories, getValues, setValue, period]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await createObligation({
        period,
        kind: v.kind,
        category_id: v.category_id,
        name: v.name,
        budget_amount: parseAmount(v.budget)!,
        actual_amount: null,
        due_date: v.due_date || null,
        notes: v.notes,
      });
      await refreshAll();
      toast.success(`${v.name} added to ${monthLabel(period)}`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Controller
        control={control}
        name="kind"
        render={({ field }) => (
          <Segmented
            className="w-full"
            value={field.value}
            onChange={(k) => {
              field.onChange(k);
              setValue("category_id", "");
            }}
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]}
          />
        )}
      />
      <Field
        label="Category"
        htmlFor="add-cat"
        error={formState.errors.category_id?.message}
        hint={
          <>
            Need a new one?{" "}
            <Link href="/settings/categories" className="font-medium text-accent">
              Manage categories
            </Link>
          </>
        }
      >
        <Select id="add-cat" {...register("category_id")}>
          <option value="">Choose…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Name" htmlFor="add-name" error={formState.errors.name?.message}>
        <Input id="add-name" {...register("name")} placeholder="e.g. Car service" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Budget" htmlFor="add-budget" error={formState.errors.budget?.message}>
          <AmountInput id="add-budget" symbol={currencySymbol(currency)} {...register("budget")} placeholder="0" />
        </Field>
        <Field label="Due date" htmlFor="add-due" error={formState.errors.due_date?.message}>
          <Input id="add-due" type="date" {...register("due_date")} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="add-notes">
        <Textarea id="add-notes" rows={2} {...register("notes")} placeholder="Optional" />
      </Field>
      <p className="text-[12px] text-ink-3">
        For items that repeat every month, add a{" "}
        <Link href="/settings/recurring" className="font-medium text-accent">
          recurring rule
        </Link>{" "}
        instead.
      </p>
      <Button type="submit" size="lg" loading={formState.isSubmitting}>
        Add item
      </Button>
    </form>
  );
}
