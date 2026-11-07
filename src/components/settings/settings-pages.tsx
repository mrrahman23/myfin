"use client";

import { Download, FileJson, FileSpreadsheet, KeyRound, LogOut, MonitorSmartphone, Plus, Share, SquarePlus, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { NotificationCard } from "@/components/overview/reminders-view";
import { Button, Card, Field, Input, Segmented, Select, Switch } from "@/components/ui/primitives";
import { ConfirmSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { toCSV, downloadFile } from "@/lib/csv";
import { applyTheme, useSession } from "@/lib/data/app-context";
import { errorMessage } from "@/lib/data/errors";
import { useProfile, useSettings, useToday } from "@/lib/data/hooks";
import { buildBackup, refreshAll, restoreBackup, updateProfile, updateSettings } from "@/lib/data/mutations";
import { CURRENCIES, toDecimalString, toMinor } from "@/lib/money";
import { isStandalone } from "@/lib/notifications";
import { getSupabase } from "@/lib/supabase/client";
import type { ThemePreference } from "@/lib/types";
import { SettingsGroup, SettingsHeader, SettingsRow } from "./settings-ui";

const wrap = "mx-auto max-w-2xl";

// ---------------------------------------------------------------------------
export function ProfileSettings() {
  const { data: profile, isLoading } = useProfile();
  return (
    <div className={wrap}>
      <SettingsHeader title="Profile" />
      {isLoading ? null : <ProfileForm key={profile?.updated_at ?? "none"} initialName={profile?.full_name ?? ""} />}
    </div>
  );
}

function ProfileForm({ initialName }: { initialName: string }) {
  const { user } = useSession();
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  return (
      <Card className="space-y-4 p-5">
        <Field label="Full name" htmlFor="p-name">
          <Input id="p-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor="p-email" hint="Change your sign-in email under Sign-in & security.">
          <Input id="p-email" value={user?.email ?? ""} disabled />
        </Field>
        <Button
          loading={saving}
          disabled={name === initialName}
          onClick={async () => {
            if (!user) return;
            setSaving(true);
            try {
              await updateProfile(user.id, name);
              await refreshAll();
              toast.success("Profile saved");
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          Save
        </Button>
      </Card>
  );
}

// ---------------------------------------------------------------------------
const TIMEZONES = [
  "Asia/Dhaka", "Asia/Kolkata", "Asia/Dubai", "Asia/Riyadh", "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Tokyo",
  "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "UTC",
];

export function PreferenceSettings() {
  const { data: settings } = useSettings();
  const toast = useToast();

  async function save(patch: Parameters<typeof updateSettings>[0], message = "Saved") {
    try {
      await updateSettings(patch);
      await refreshAll();
      toast.success(message);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  if (!settings) return <div className={wrap}><SettingsHeader title="Preferences" /></div>;
  const zones = TIMEZONES.includes(settings.timezone) ? TIMEZONES : [settings.timezone, ...TIMEZONES];

  return (
    <div className={wrap}>
      <SettingsHeader title="Preferences" />
      <SettingsGroup title="Money" footer="Amounts are stored exactly as entered — changing the currency only changes the symbol shown, it does not convert values.">
        <div className="p-4">
          <Field label="Currency" htmlFor="pref-cur">
            <Select id="pref-cur" value={settings.currency} onChange={(e) => save({ currency: e.target.value }, "Currency updated")}>
              {Object.entries(CURRENCIES).map(([code, c]) => (
                <option key={code} value={code}>
                  {c.symbol} {code} — {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </SettingsGroup>
      <SettingsGroup title="Time" footer="Used to decide what “today” is for due dates, reminders and new payments.">
        <div className="p-4">
          <Field label="Timezone" htmlFor="pref-tz">
            <Select id="pref-tz" value={settings.timezone} onChange={(e) => save({ timezone: e.target.value }, "Timezone updated")}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </SettingsGroup>
      <SettingsGroup title="Appearance">
        <div className="p-4" id="theme">
          <Segmented<ThemePreference>
            className="w-full"
            value={settings.theme}
            onChange={(theme) => {
              applyTheme(theme);
              void save({ theme }, "Appearance updated");
            }}
            options={[
              { value: "system", label: "Automatic" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
      </SettingsGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function NotificationSettings() {
  const { data: settings } = useSettings();
  const toast = useToast();
  async function save(patch: Parameters<typeof updateSettings>[0]) {
    try {
      await updateSettings(patch);
      await refreshAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  return (
    <div className={wrap}>
      <SettingsHeader title="Notifications" />
      <div className="mb-6">
        <NotificationCard />
      </div>
      {settings ? (
        <SettingsGroup
          title="When to remind me"
          footer="Due dates are set per item — edit them in the monthly budget, or set a default day on each category or recurring item. Native iOS push can be added later through the push_subscriptions table and a Capacitor build."
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <label htmlFor="days" className="text-[15px]">
              Days before due date
            </label>
            <Select
              id="days"
              className="h-10 w-24"
              value={settings.reminder_days_before}
              onChange={(e) => save({ reminder_days_before: Number(e.target.value) })}
            >
              {[0, 1, 2, 3, 5, 7, 10, 14].map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "Same day" : d}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[15px]">Remind me about overdue items</span>
            <Switch checked={settings.notify_overdue} onChange={(v) => save({ notify_overdue: v })} label="Overdue reminders" />
          </div>
        </SettingsGroup>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function SecuritySettings() {
  const { user } = useSession();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={wrap}>
      <SettingsHeader title="Sign-in & security" />
      <SettingsGroup title="Password">
        <form
          className="space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length < 8) return toast.error("Use at least 8 characters");
            if (password !== confirm) return toast.error("Passwords don't match");
            void run("pw", async () => {
              const { error } = await getSupabase().auth.updateUser({ password });
              if (error) throw error;
              setPassword("");
              setConfirm("");
              toast.success("Password updated");
            });
          }}
        >
          <input type="email" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
          <Field label="New password" htmlFor="pw1">
            <Input id="pw1" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm password" htmlFor="pw2">
            <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy === "pw"} disabled={!password}>
            <KeyRound className="h-4 w-4" /> Update password
          </Button>
        </form>
      </SettingsGroup>
      <SettingsGroup title="Email" footer="We'll send a confirmation link to both addresses.">
        <form
          className="space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run("email", async () => {
              const { error } = await getSupabase().auth.updateUser(
                { email },
                { emailRedirectTo: `${window.location.origin}/auth/callback?next=/settings/profile` },
              );
              if (error) throw error;
              setEmail("");
              toast.success("Check your inbox to confirm the change");
            });
          }}
        >
          <Field label={`Current: ${user?.email ?? ""}`} htmlFor="new-email">
            <Input id="new-email" type="email" autoComplete="email" placeholder="New email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={busy === "email"} disabled={!email.includes("@")}>
            Change email
          </Button>
        </form>
      </SettingsGroup>
      <SettingsGroup title="Sessions" footer="Your data is protected by row-level security: every query is limited to your own account by the database itself.">
        <SettingsRow icon={LogOut} tone="gray" label="Sign out of this device" onClick={() => getSupabase().auth.signOut({ scope: "local" })} trailing={<span />} />
        <SettingsRow
          icon={MonitorSmartphone}
          tone="red"
          label="Sign out everywhere"
          destructive
          onClick={() => run("all", async () => void (await getSupabase().auth.signOut({ scope: "global" })))}
          trailing={<span />}
        />
      </SettingsGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function InstallSettings() {
  const [standalone] = useState(() => isStandalone());
  return (
    <div className={wrap}>
      <SettingsHeader title="Install myFin" />
      {standalone ? (
        <Card className="mb-6 p-5 text-[15px] text-positive">✓ You&apos;re using the installed app.</Card>
      ) : null}
      <SettingsGroup title="iPhone & iPad (Safari)">
        <ol className="space-y-3 p-5 text-[15px] leading-relaxed text-ink-2">
          <li className="flex gap-3">
            <Step n={1} /> Open myFin in <b className="text-ink">Safari</b>.
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <span>
              Tap the <Share className="inline h-4 w-4 align-[-3px] text-accent" /> <b className="text-ink">Share</b> button.
            </span>
          </li>
          <li className="flex gap-3">
            <Step n={3} />
            <span>
              Choose <SquarePlus className="inline h-4 w-4 align-[-3px]" /> <b className="text-ink">Add to Home Screen</b>, then <b className="text-ink">Add</b>.
            </span>
          </li>
          <li className="flex gap-3">
            <Step n={4} /> Open myFin from your Home Screen for the full-screen app, then turn on reminders in Notifications.
          </li>
        </ol>
      </SettingsGroup>
      <SettingsGroup title="Android & desktop (Chrome, Edge)" footer="myFin is a Progressive Web App. It is installed from the browser rather than the App Store, and stays up to date automatically.">
        <p className="p-5 text-[15px] leading-relaxed text-ink-2">
          Use the <b className="text-ink">Install</b> icon in the address bar, or the browser menu → <b className="text-ink">Install app</b>.
        </p>
      </SettingsGroup>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent">{n}</span>;
}

// ---------------------------------------------------------------------------
export function DataSettings() {
  const toast = useToast();
  const today = useToday();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ name: string; data: unknown; counts: string } | null>(null);

  async function exportCsv(kind: "transactions" | "budget") {
    setBusy(kind);
    try {
      const data = (await buildBackup()) as Record<string, Array<Record<string, unknown>>>;
      const cats = new Map(data.categories.map((c) => [c.id as string, c.name as string]));
      const methods = new Map(data.payment_methods.map((m) => [m.id as string, m.name as string]));
      if (kind === "transactions") {
        const rows = [...data.transactions].sort((a, b) => String(b.txn_date).localeCompare(String(a.txn_date)));
        downloadFile(
          `myfin-all-transactions-${today}.csv`,
          toCSV(
            ["Date", "Type", "Description", "Category", "Payment method", "Amount", "Notes"],
            rows.map((t) => [
              t.txn_date as string,
              t.kind as string,
              (t.description as string) ?? "",
              cats.get(t.category_id as string) ?? "",
              methods.get(t.payment_method_id as string) ?? "",
              toDecimalString(toMinor(t.amount as string)),
              (t.notes as string) ?? "",
            ]),
          ),
        );
      } else {
        const paid = new Map<string, number>();
        for (const a of data.payment_allocations) paid.set(a.obligation_id as string, (paid.get(a.obligation_id as string) ?? 0) + toMinor(a.amount as string));
        const rows = [...data.obligations].sort((a, b) => String(a.period).localeCompare(String(b.period)) || String(a.name).localeCompare(String(b.name)));
        downloadFile(
          `myfin-monthly-budgets-${today}.csv`,
          toCSV(
            ["Month", "Type", "Item", "Category", "Budget", "Actual", "Paid", "Outstanding", "Due date", "Notes"],
            rows.map((o) => {
              const due = toMinor((o.actual_amount ?? o.budget_amount) as string);
              const p = paid.get(o.id as string) ?? 0;
              return [
                String(o.period).slice(0, 7),
                o.kind as string,
                o.name as string,
                cats.get(o.category_id as string) ?? "",
                toDecimalString(toMinor(o.budget_amount as string)),
                o.actual_amount === null ? "" : toDecimalString(toMinor(o.actual_amount as string)),
                toDecimalString(p),
                toDecimalString(due - p),
                (o.due_date as string) ?? "",
                (o.notes as string) ?? "",
              ];
            }),
          ),
        );
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function backup() {
    setBusy("backup");
    try {
      const data = await buildBackup();
      downloadFile(`myfin-backup-${today}.json`, JSON.stringify(data, null, 2), "application/json");
      toast.success("Backup downloaded");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function pickFile(file: File) {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("That file is too large to be a myFin backup.");
      const data = JSON.parse(await file.text());
      if (data?.app !== "myfin") throw new Error("This file is not a myFin backup.");
      const counts = ["transactions", "obligations", "categories"]
        .map((k) => `${Array.isArray(data[k]) ? data[k].length : 0} ${k}`)
        .join(", ");
      setPending({ name: file.name, data, counts });
    } catch (e) {
      toast.error(e instanceof SyntaxError ? "That file isn't valid JSON." : errorMessage(e));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function restore() {
    if (!pending) return;
    setBusy("restore");
    try {
      const result = await restoreBackup(pending.data);
      await refreshAll();
      toast.success(`Restored ${result.transactions ?? 0} transactions and ${result.obligations ?? 0} items`);
      setPending(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={wrap}>
      <SettingsHeader title="Data" />
      <SettingsGroup title="Export" footer="CSV files open in Excel, Numbers and Google Sheets.">
        <SettingsRow icon={FileSpreadsheet} tone="green" label="All transactions (CSV)" onClick={() => exportCsv("transactions")} trailing={busy === "transactions" ? <Spinner /> : <Download className="h-4 w-4 text-ink-3" />} />
        <SettingsRow icon={FileSpreadsheet} tone="teal" label="Monthly budgets (CSV)" onClick={() => exportCsv("budget")} trailing={busy === "budget" ? <Spinner /> : <Download className="h-4 w-4 text-ink-3" />} />
      </SettingsGroup>
      <SettingsGroup title="Backup & restore" footer="A backup contains everything: categories, recurring items, every month, payments and settings. Restoring replaces all current data in this account.">
        <SettingsRow icon={FileJson} tone="blue" label="Download backup (JSON)" onClick={backup} trailing={busy === "backup" ? <Spinner /> : <Download className="h-4 w-4 text-ink-3" />} />
        <SettingsRow icon={Upload} tone="orange" label="Restore from backup…" onClick={() => fileRef.current?.click()} trailing={<Plus className="h-4 w-4 text-ink-3" />} />
      </SettingsGroup>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
      />
      <ConfirmSheet
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={restore}
        loading={busy === "restore"}
        destructive
        confirmLabel="Replace my data"
        title="Restore this backup?"
        body={
          pending ? (
            <>
              <b className="text-ink">{pending.name}</b> contains {pending.counts}. All current data in this account will be replaced. Download a backup first if
              you might need it.
            </>
          ) : null
        }
      />
    </div>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" />;
}
