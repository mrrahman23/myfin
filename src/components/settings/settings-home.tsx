"use client";

import {
  Bell,
  CreditCard,
  Database,
  Globe,
  LogOut,
  Palette,
  Repeat,
  Shapes,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/primitives";
import { useSession } from "@/lib/data/app-context";
import { useCategories, usePaymentMethods, useProfile, useRecurringRules, useSettings } from "@/lib/data/hooks";
import { CURRENCIES } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { SettingsGroup, SettingsRow } from "./settings-ui";

export function SettingsHome() {
  const { user } = useSession();
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();
  const { data: categories } = useCategories();
  const { data: methods } = usePaymentMethods();
  const { data: rules } = useRecurringRules();
  const name = profile?.full_name || user?.email?.split("@")[0] || "You";
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" />
      <Card className="mb-6 flex items-center gap-4 p-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--hero-from)] to-[var(--hero-to)] text-[19px] font-semibold text-white">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold">{name}</p>
          <p className="truncate text-[13px] text-ink-3">{user?.email}</p>
        </div>
      </Card>

      <SettingsGroup title="Account">
        <SettingsRow icon={UserRound} tone="blue" label="Profile" href="/settings/profile" />
        <SettingsRow icon={ShieldCheck} tone="green" label="Sign-in & security" href="/settings/security" />
      </SettingsGroup>

      <SettingsGroup title="Preferences">
        <SettingsRow
          icon={Globe}
          tone="teal"
          label="Currency & timezone"
          value={settings ? `${settings.currency} · ${settings.timezone.split("/").pop()?.replace("_", " ")}` : undefined}
          href="/settings/preferences"
        />
        <SettingsRow
          icon={Palette}
          tone="violet"
          label="Appearance"
          value={settings ? settings.theme[0].toUpperCase() + settings.theme.slice(1) : undefined}
          href="/settings/preferences#theme"
        />
        <SettingsRow
          icon={Bell}
          tone="red"
          label="Notifications"
          value={settings ? (settings.notifications_enabled ? "On" : "Off") : undefined}
          href="/settings/notifications"
        />
      </SettingsGroup>

      <SettingsGroup title="Budget setup">
        <SettingsRow icon={Shapes} tone="orange" label="Categories" value={categories ? String(categories.filter((c) => !c.is_archived).length) : undefined} href="/settings/categories" />
        <SettingsRow icon={Repeat} tone="blue" label="Recurring items" value={rules ? String(rules.filter((r) => r.is_active).length) : undefined} href="/settings/recurring" />
        <SettingsRow icon={CreditCard} tone="yellow" label="Payment methods" value={methods ? String(methods.filter((m) => !m.is_archived).length) : undefined} href="/settings/payment-methods" />
      </SettingsGroup>

      <SettingsGroup title="Data">
        <SettingsRow icon={Database} tone="gray" label="Export, backup & restore" href="/settings/data" />
        <SettingsRow icon={Smartphone} tone="gray" label="Install on iPhone / iPad" href="/settings/install" />
      </SettingsGroup>

      <SettingsGroup footer={settings ? `Currency: ${CURRENCIES[settings.currency]?.label ?? settings.currency}` : undefined}>
        <SettingsRow icon={LogOut} tone="red" label="Sign out" destructive onClick={() => getSupabase().auth.signOut()} trailing={<span />} />
      </SettingsGroup>
    </div>
  );
}
