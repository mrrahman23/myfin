"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pause, Plus, Repeat, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Money } from "@/components/ui/money";
import { AmountInput, Button, EmptyState, Field, Input, Segmented, Select, Switch, Textarea } from "@/components/ui/primitives";
import { ConfirmSheet, Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatDate, isValidISODate, MONTH_NAMES, periodOf, WEEKDAY_NAMES } from "@/lib/dates";
import { errorMessage } from "@/lib/data/errors";
import { useCategories, useCurrency, useRecurringRules, useToday } from "@/lib/data/hooks";
import { deleteRecurringRule, refreshAll, saveRecurringRule } from "@/lib/data/mutations";
import { currencySymbol, parseAmount, toMinor } from "@/lib/money";
import type { EntryKind, RecurringRule } from "@/lib/types";
import { SettingsGroup, SettingsHeader } from "./settings-ui";

export function describeRule(r: Pick<RecurringRule, "frequency" | "interval_count" | "interval_unit" | "day_of_month" | "weekday" | "month_of_year">) {
  const n = r.interval_count;
  const day = r.day_of_month ? `on day ${r.day_of_month}` : "";
  switch (r.frequency) {
    case "monthly":
      return n === 1 ? `Monthly ${day}` : `Every ${n} months ${day}`;
    case "weekly":
      return `${n === 1 ? "Weekly" : `Every ${n} weeks`} on ${WEEKDAY_NAMES[r.weekday ?? 0]}`;
    case "yearly":
      return `${n === 1 ? "Yearly" : `Every ${n} years`} in ${MONTH_NAMES[(r.month_of_year ?? 1) - 1]} ${day}`;
    case "custom":
      return `Every ${n} ${r.interval_unit}${n === 1 ? "" : "s"}${r.interval_unit === "month" && day ? ` ${day}` : ""}`;
  }
}

export function RecurringSettings() {
  const { data: rules } = useRecurringRules();
  const { data: categories } = useCategories();
  const [kind, setKind] = useState<EntryKind>("expense");
  const [editing, setEditing] = useState<RecurringRule | "new" | null>(null);
  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const list = (rules ?? []).filter((r) => r.kind === kind);
  const active = list.filter((r) => r.is_active);
  const paused = list.filter((r) => !r.is_active);
  const monthlyTotal = active.filter((r) => r.frequency === "monthly" && r.interval_count === 1).reduce((s, r) => s + toMinor(r.amount), 0);

  const row = (r: RecurringRule) => (
    <button
      key={r.id}
      type="button"
      onClick={() => setEditing(r)}
      className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
    >
      <CategoryIcon icon={catMap.get(r.category_id)?.icon} kind={r.kind} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{r.name}</span>
        <span className="block truncate text-[12px] text-ink-3">
          {describeRule(r)}
          {r.end_date ? ` · until ${formatDate(r.end_date)}` : ""}
        </span>
      </span>
      {!r.is_active ? <Pause className="h-4 w-4 text-ink-3" /> : null}
      <Money value={toMinor(r.amount)} className="text-[14px] font-medium" />
    </button>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsHeader
        title="Recurring items"
        action={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "expense", label: "Expenses" },
            { value: "income", label: "Income" },
          ]}
        />
        <span className="text-[13px] text-ink-3">
          Monthly total <Money value={monthlyTotal} className="font-semibold text-ink" />
        </span>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Repeat className="h-6 w-6" />} title="No recurring items" body="Recurring items are added to each month automatically when you open it." />
      ) : (
        <>
          <SettingsGroup footer="Items are generated once per month when that month is opened. Opening a month again never creates duplicates, and items you delete from a month stay deleted.">
            {active.map(row)}
          </SettingsGroup>
          {paused.length ? <SettingsGroup title="Paused">{paused.map(row)}</SettingsGroup> : null}
        </>
      )}
      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "New recurring item" : "Edit recurring item"}>
        {editing ? <RuleForm key={editing === "new" ? "new" : editing.id} rule={editing === "new" ? null : editing} defaultKind={kind} onDone={() => setEditing(null)} /> : null}
      </Sheet>
    </div>
  );
}

const schema = z
  .object({
    kind: z.enum(["income", "expense"]),
    category_id: z.string().min(1, "Choose a category"),
    name: z.string().trim().min(1, "Name is required").max(80),
    amount: z.string(),
    frequency: z.enum(["monthly", "weekly", "yearly", "custom"]),
    interval_count: z.coerce.number<string>().int().min(1, "At least 1").max(365),
    interval_unit: z.enum(["day", "week", "month"]),
    day_of_month: z.string(),
    weekday: z.string(),
    month_of_year: z.string(),
    start_date: z.string().refine(isValidISODate, "Choose a start date"),
    end_date: z.string(),
    is_active: z.boolean(),
    notes: z.string().max(1000),
  })
  .superRefine((v, ctx) => {
    const a = parseAmount(v.amount);
    if (a === null || a < 0) ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter a valid amount" });
    if (v.end_date && (!isValidISODate(v.end_date) || v.end_date < v.start_date))
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "End date must be after the start date" });
  });
type Values = z.input<typeof schema>;
type Output = z.output<typeof schema>;

function RuleForm({ rule, defaultKind, onDone }: { rule: RecurringRule | null; defaultKind: EntryKind; onDone: () => void }) {
  const toast = useToast();
  const today = useToday();
  const currency = useCurrency();
  const { data: categories } = useCategories();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { register, handleSubmit, control, setValue, getValues, formState } = useForm<Values, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: rule?.kind ?? defaultKind,
      category_id: rule?.category_id ?? "",
      name: rule?.name ?? "",
      amount: rule ? String(toMinor(rule.amount) / 100) : "",
      frequency: rule?.frequency ?? "monthly",
      interval_count: String(rule?.interval_count ?? 1),
      interval_unit: rule?.interval_unit ?? "month",
      day_of_month: rule?.day_of_month ? String(rule.day_of_month) : "1",
      weekday: String(rule?.weekday ?? 5),
      month_of_year: String(rule?.month_of_year ?? +today.slice(5, 7)),
      start_date: rule?.start_date ?? periodOf(today),
      end_date: rule?.end_date ?? "",
      is_active: rule?.is_active ?? true,
      notes: rule?.notes ?? "",
    },
  });
  const [kind, frequency, unit] = useWatch({ control, name: ["kind", "frequency", "interval_unit"] });
  const options = (categories ?? []).filter((c) => c.kind === kind && (!c.is_archived || c.id === rule?.category_id));
  const usesDayOfMonth = frequency === "monthly" || frequency === "yearly" || (frequency === "custom" && unit === "month");

  const onSubmit = handleSubmit(async (v) => {
    try {
      await saveRecurringRule(
        {
          kind: v.kind,
          category_id: v.category_id,
          name: v.name,
          amount: parseAmount(v.amount)!,
          frequency: v.frequency,
          interval_count: v.frequency === "weekly" || v.frequency === "monthly" || v.frequency === "yearly" || v.frequency === "custom" ? v.interval_count : 1,
          interval_unit: v.frequency === "custom" ? v.interval_unit : null,
          day_of_month: usesDayOfMonth ? Number(v.day_of_month) : null,
          weekday: v.frequency === "weekly" ? Number(v.weekday) : null,
          month_of_year: v.frequency === "yearly" ? Number(v.month_of_year) : null,
          start_date: v.start_date,
          end_date: v.end_date || null,
          is_active: v.is_active,
          notes: v.notes,
        },
        rule?.id,
      );
      await refreshAll();
      toast.success(rule ? "Recurring item updated — applies to months you open next" : "Recurring item added");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {!rule ? (
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
      ) : null}
      <Field label="Category" htmlFor="r-cat" error={formState.errors.category_id?.message}>
        <Select
          id="r-cat"
          {...register("category_id", {
            onChange: (e) => {
              const c = categories?.find((x) => x.id === e.target.value);
              if (c && !getValues("name")) setValue("name", c.name);
              if (c && !getValues("amount")) setValue("amount", String(toMinor(c.default_budget) / 100));
              if (c?.default_due_day) setValue("day_of_month", String(c.default_due_day));
            },
          })}
        >
          <option value="">Choose…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" htmlFor="r-name" error={formState.errors.name?.message}>
          <Input id="r-name" {...register("name")} />
        </Field>
        <Field label="Amount" htmlFor="r-amount" error={formState.errors.amount?.message}>
          <AmountInput id="r-amount" symbol={currencySymbol(currency)} {...register("amount")} placeholder="0" />
        </Field>
      </div>
      <Field label="Repeats">
        <Controller
          control={control}
          name="frequency"
          render={({ field }) => (
            <Segmented
              className="w-full"
              size="sm"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "weekly", label: "Weekly" },
                { value: "yearly", label: "Yearly" },
                { value: "custom", label: "Custom" },
              ]}
            />
          )}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Every" htmlFor="r-int" error={formState.errors.interval_count?.message}>
          <Input id="r-int" type="number" inputMode="numeric" min={1} max={365} {...register("interval_count")} />
        </Field>
        {frequency === "custom" ? (
          <Field label="Unit" htmlFor="r-unit">
            <Select id="r-unit" {...register("interval_unit")}>
              <option value="day">Days</option>
              <option value="week">Weeks</option>
              <option value="month">Months</option>
            </Select>
          </Field>
        ) : (
          <div className="flex items-end pb-3 text-[14px] text-ink-3">
            {frequency === "monthly" ? "month(s)" : frequency === "weekly" ? "week(s)" : "year(s)"}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {frequency === "yearly" ? (
          <Field label="Month" htmlFor="r-moy">
            <Select id="r-moy" {...register("month_of_year")}>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {usesDayOfMonth ? (
          <Field label="Due day" htmlFor="r-dom">
            <Select id="r-dom" {...register("day_of_month")}>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {frequency === "weekly" ? (
          <Field label="On" htmlFor="r-wd">
            <Select id="r-wd" {...register("weekday")}>
              {WEEKDAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" htmlFor="r-start" error={formState.errors.start_date?.message}>
          <Input id="r-start" type="date" {...register("start_date")} />
        </Field>
        <Field label="Ends (optional)" htmlFor="r-end" error={formState.errors.end_date?.message}>
          <Input id="r-end" type="date" {...register("end_date")} />
        </Field>
      </div>
      <Controller
        control={control}
        name="is_active"
        render={({ field }) => (
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
            <span className="text-[14px]">
              Active
              <span className="block text-[12px] text-ink-3">Paused items are not added to new months</span>
            </span>
            <Switch checked={field.value} onChange={field.onChange} label="Active" />
          </label>
        )}
      />
      <Field label="Notes" htmlFor="r-notes">
        <Textarea id="r-notes" rows={2} {...register("notes")} />
      </Field>
      <p className="text-[12px] text-ink-3">Changes apply to months you open from now on. Months already opened keep their items — edit those in the budget.</p>
      <div className="flex gap-3">
        {rule ? (
          <Button variant="danger" size="icon" aria-label="Delete recurring item" className="h-[52px] w-[52px] rounded-2xl" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-5 w-5" />
          </Button>
        ) : null}
        <Button type="submit" size="lg" className="flex-1" loading={formState.isSubmitting}>
          {rule ? "Save" : "Add recurring item"}
        </Button>
      </div>
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        loading={deleting}
        destructive
        confirmLabel="Delete"
        title={`Delete ${rule?.name}?`}
        body="Future months won't include it. Items already in your months, and their payments, are kept."
        onConfirm={async () => {
          if (!rule) return;
          setDeleting(true);
          try {
            await deleteRecurringRule(rule.id);
            await refreshAll();
            toast.success("Recurring item deleted");
            onDone();
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setDeleting(false);
          }
        }}
      />
    </form>
  );
}
