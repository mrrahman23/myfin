"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { CategoryIcon, ICON_KEYS, ICONS } from "@/components/ui/category-icon";
import { Money } from "@/components/ui/money";
import { AmountInput, Button, Field, Input, Segmented, Select, Switch } from "@/components/ui/primitives";
import { ConfirmSheet, Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { periodOf } from "@/lib/dates";
import { errorMessage } from "@/lib/data/errors";
import { useCategories, useCurrency, useToday } from "@/lib/data/hooks";
import { deleteCategory, refreshAll, saveCategory, setCategoryArchived } from "@/lib/data/mutations";
import { currencySymbol, parseAmount, toMinor } from "@/lib/money";
import type { Category, EntryKind } from "@/lib/types";
import { SettingsGroup, SettingsHeader } from "./settings-ui";

export function CategoriesSettings() {
  const { data: categories } = useCategories();
  const [kind, setKind] = useState<EntryKind>("expense");
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const groups = useMemo(() => {
    const list = (categories ?? []).filter((c) => c.kind === kind && c.is_archived === showArchived);
    const map = new Map<string, Category[]>();
    for (const c of list) map.set(c.group_name || "Other", [...(map.get(c.group_name || "Other") ?? []), c]);
    return [...map.entries()];
  }, [categories, kind, showArchived]);
  const archivedCount = (categories ?? []).filter((c) => c.kind === kind && c.is_archived).length;

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsHeader
        title="Categories"
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
        {archivedCount || showArchived ? (
          <Button size="sm" variant="ghost" onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? "Show active" : `Archived (${archivedCount})`}
          </Button>
        ) : null}
      </div>
      {groups.length === 0 ? (
        <p className="py-10 text-center text-[14px] text-ink-3">{showArchived ? "No archived categories." : "No categories yet."}</p>
      ) : (
        groups.map(([group, list]) => (
          <SettingsGroup key={group} title={group}>
            {list.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setEditing(c)}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <CategoryIcon icon={c.icon} kind={c.kind} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{c.name}</span>
                  <span className="block text-[12px] text-ink-3">
                    {c.default_due_day ? `Due day ${c.default_due_day} · ` : ""}
                    {c.carry_forward ? "Carries balances forward" : "No carry-forward"}
                  </span>
                </span>
                <Money value={toMinor(c.default_budget)} className="text-[14px] text-ink-2" />
              </button>
            ))}
          </SettingsGroup>
        ))
      )}
      <p className="px-4 text-[12.5px] leading-relaxed text-ink-3">
        The default budget is used when you add a new item for this category. Monthly amounts for recurring items are set in Recurring items or
        directly in each month.
      </p>
      <CategorySheet category={editing} defaultKind={kind} onClose={() => setEditing(null)} />
    </div>
  );
}

const schema = z
  .object({
    kind: z.enum(["income", "expense"]),
    name: z.string().trim().min(1, "Name is required").max(80),
    group_name: z.string().max(60),
    icon: z.string(),
    default_budget: z.string(),
    default_due_day: z.string(),
    carry_forward: z.boolean(),
    createRule: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const m = parseAmount(v.default_budget || "0");
    if (m === null || m < 0) ctx.addIssue({ code: "custom", path: ["default_budget"], message: "Enter a valid amount" });
  });
type Values = z.infer<typeof schema>;

function CategorySheet({ category, defaultKind, onClose }: { category: Category | "new" | null; defaultKind: EntryKind; onClose: () => void }) {
  const isNew = category === "new";
  return (
    <Sheet open={Boolean(category)} onClose={onClose} title={isNew ? "New category" : "Edit category"}>
      {category ? <CategoryForm key={isNew ? "new" : category.id} category={isNew ? null : category} defaultKind={defaultKind} onDone={onClose} /> : null}
    </Sheet>
  );
}

function CategoryForm({ category, defaultKind, onDone }: { category: Category | null; defaultKind: EntryKind; onDone: () => void }) {
  const toast = useToast();
  const today = useToday();
  const currency = useCurrency();
  const { data: categories } = useCategories();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, control, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: category?.kind ?? defaultKind,
      name: category?.name ?? "",
      group_name: category?.group_name ?? "",
      icon: category?.icon ?? "",
      default_budget: category ? String(toMinor(category.default_budget) / 100) : "",
      default_due_day: category?.default_due_day ? String(category.default_due_day) : "",
      carry_forward: category?.carry_forward ?? true,
      createRule: true,
    },
  });
  const kind = useWatch({ control, name: "kind" });
  const groupNames = [...new Set((categories ?? []).filter((c) => c.kind === kind && c.group_name).map((c) => c.group_name!))];

  const onSubmit = handleSubmit(async (v) => {
    try {
      await saveCategory(
        {
          kind: v.kind,
          name: v.name,
          group_name: v.group_name,
          icon: v.icon,
          default_budget: parseAmount(v.default_budget || "0")!,
          default_due_day: v.default_due_day ? Number(v.default_due_day) : null,
          carry_forward: v.carry_forward,
        },
        category?.id,
        { createMonthlyRule: !category && v.createRule && (parseAmount(v.default_budget || "0") ?? 0) > 0, startPeriod: periodOf(today) },
      );
      await refreshAll();
      toast.success(category ? "Category updated" : "Category added");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  async function archive() {
    if (!category) return;
    setBusy(true);
    try {
      await setCategoryArchived(category.id, !category.is_archived);
      await refreshAll();
      toast.success(category.is_archived ? "Category restored" : "Category archived — it won't appear in new months");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!category) return;
    setBusy(true);
    try {
      await deleteCategory(category.id);
      await refreshAll();
      toast.success("Category deleted");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {!category ? (
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <Segmented
              className="w-full"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "expense", label: "Expense" },
                { value: "income", label: "Income" },
              ]}
            />
          )}
        />
      ) : null}
      <Field label="Name" htmlFor="c-name" error={formState.errors.name?.message}>
        <Input id="c-name" {...register("name")} placeholder="e.g. Internet Bill" data-autofocus />
      </Field>
      <Field label="Group" htmlFor="c-group" hint="Used to group items and for analytics.">
        <Input id="c-group" list="c-groups" {...register("group_name")} placeholder="e.g. Utilities" />
        <datalist id="c-groups">
          {groupNames.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Default budget" htmlFor="c-budget" error={formState.errors.default_budget?.message}>
          <AmountInput id="c-budget" symbol={currencySymbol(currency)} {...register("default_budget")} placeholder="0" />
        </Field>
        <Field label="Due day" htmlFor="c-due">
          <Select id="c-due" {...register("default_due_day")}>
            <option value="">None</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
                {i + 1 >= 29 ? " (or last day)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Icon">
        <Controller
          control={control}
          name="icon"
          render={({ field }) => (
            <div className="grid grid-cols-7 gap-2 sm:grid-cols-10">
              {ICON_KEYS.map((key) => {
                const Icon = ICONS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={key}
                    aria-pressed={field.value === key}
                    onClick={() => field.onChange(key)}
                    className={cn(
                      "grid aspect-square place-items-center rounded-xl transition",
                      field.value === key ? "bg-ink text-inverse" : "bg-surface-2 text-ink-2 hover:bg-surface-3",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </button>
                );
              })}
            </div>
          )}
        />
      </Field>
      <Controller
        control={control}
        name="carry_forward"
        render={({ field }) => (
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
            <span className="text-[14px]">
              Carry unpaid balances forward
              <span className="block text-[12px] text-ink-3">Any amount left unpaid moves into the next month&apos;s item</span>
            </span>
            <Switch checked={field.value} onChange={field.onChange} label="Carry forward" />
          </label>
        )}
      />
      {!category ? (
        <Controller
          control={control}
          name="createRule"
          render={({ field }) => (
            <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
              <span className="text-[14px]">
                Add to every month
                <span className="block text-[12px] text-ink-3">Creates a monthly recurring item from this month</span>
              </span>
              <Switch checked={field.value} onChange={field.onChange} label="Create monthly recurring item" />
            </label>
          )}
        />
      ) : null}
      <div className="flex gap-3 pt-1">
        {category ? (
          <>
            <Button variant="danger" size="icon" className="h-[52px] w-[52px] rounded-2xl" aria-label="Delete category" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-5 w-5" />
            </Button>
            <Button variant="secondary" className="h-[52px] rounded-2xl" onClick={archive} loading={busy}>
              {category.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {category.is_archived ? "Restore" : "Archive"}
            </Button>
          </>
        ) : null}
        <Button type="submit" size="lg" className="flex-1" loading={formState.isSubmitting}>
          {category ? "Save" : "Add category"}
        </Button>
      </div>
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={busy}
        destructive
        confirmLabel="Delete"
        title={`Delete ${category?.name}?`}
        body="Categories that already have monthly items can't be deleted — archive them instead to keep your history intact. Recurring rules for this category are removed."
      />
    </form>
  );
}
