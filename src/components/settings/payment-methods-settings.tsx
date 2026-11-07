"use client";

import { Banknote, Building2, CircleEllipsis, CreditCard, Plus, Smartphone, Star, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { ConfirmSheet, Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/errors";
import { usePaymentMethods } from "@/lib/data/hooks";
import {
  deletePaymentMethod,
  refreshAll,
  savePaymentMethod,
  setDefaultPaymentMethod,
  setPaymentMethodArchived,
} from "@/lib/data/mutations";
import type { PaymentMethod, PaymentMethodType } from "@/lib/types";
import { SettingsGroup, SettingsHeader } from "./settings-ui";

const TYPE_ICON: Record<PaymentMethodType, LucideIcon> = {
  cash: Banknote,
  bank: Building2,
  card: CreditCard,
  mobile: Smartphone,
  other: CircleEllipsis,
};
const TYPE_LABEL: Record<PaymentMethodType, string> = {
  cash: "Cash",
  bank: "Bank account",
  card: "Card",
  mobile: "Mobile wallet",
  other: "Other",
};

export function PaymentMethodsSettings() {
  const { data: methods } = usePaymentMethods();
  const [editing, setEditing] = useState<PaymentMethod | "new" | null>(null);
  const active = (methods ?? []).filter((m) => !m.is_archived);
  const archived = (methods ?? []).filter((m) => m.is_archived);

  const row = (m: PaymentMethod) => {
    const Icon = TYPE_ICON[m.type];
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => setEditing(m)}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2"
      >
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-surface-3 text-ink-2">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px]">{m.name}</span>
          <span className="block text-[12px] text-ink-3">{TYPE_LABEL[m.type]}</span>
        </span>
        {m.is_default ? (
          <span className="flex items-center gap-1 text-[12px] font-semibold text-accent">
            <Star className="h-3.5 w-3.5 fill-current" /> Default
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsHeader
        title="Payment methods"
        action={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New
          </Button>
        }
      />
      <SettingsGroup footer="The default method is used for one-tap payments.">{active.map(row)}</SettingsGroup>
      {archived.length ? <SettingsGroup title="Archived">{archived.map(row)}</SettingsGroup> : null}
      <MethodSheet method={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function MethodSheet({ method, onClose }: { method: PaymentMethod | "new" | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(method)} onClose={onClose} title={method === "new" ? "New payment method" : "Edit payment method"} size="sm">
      {method ? <MethodForm key={method === "new" ? "new" : method.id} method={method === "new" ? null : method} onDone={onClose} /> : null}
    </Sheet>
  );
}

function MethodForm({ method, onDone }: { method: PaymentMethod | null; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(method?.name ?? "");
  const [type, setType] = useState<PaymentMethodType>(method?.type ?? "bank");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(key: string, fn: () => Promise<void>, message: string) {
    setBusy(key);
    try {
      await fn();
      await refreshAll();
      toast.success(message);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return toast.error("Name is required");
        void run("save", () => savePaymentMethod({ name, type }, method?.id), method ? "Saved" : "Payment method added");
      }}
    >
      <Field label="Name" htmlFor="pm-name">
        <Input id="pm-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. EBL Savings" data-autofocus />
      </Field>
      <Field label="Type" htmlFor="pm-type">
        <Select id="pm-type" value={type} onChange={(e) => setType(e.target.value as PaymentMethodType)}>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" size="lg" loading={busy === "save"}>
        {method ? "Save" : "Add"}
      </Button>
      {method ? (
        <div className="grid grid-cols-2 gap-3">
          {!method.is_default && !method.is_archived ? (
            <Button variant="tinted" onClick={() => run("default", () => setDefaultPaymentMethod(method.id), `${method.name} is now the default`)} loading={busy === "default"}>
              Make default
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="secondary"
            onClick={() => run("archive", () => setPaymentMethodArchived(method, !method.is_archived), method.is_archived ? "Restored" : "Archived")}
            loading={busy === "archive"}
          >
            {method.is_archived ? "Restore" : "Archive"}
          </Button>
          <Button variant="danger" className="col-span-2" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </div>
      ) : null}
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => method && run("delete", () => deletePaymentMethod(method.id), "Deleted")}
        loading={busy === "delete"}
        destructive
        confirmLabel="Delete"
        title={`Delete ${method?.name}?`}
        body="Transactions that used it are kept but will show no payment method. Archive it instead to keep the label."
      />
    </form>
  );
}
