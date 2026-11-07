"use client";

import { Crown, Eye, EyeOff, LogOut, UserPlus, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, Field, Input, Switch } from "@/components/ui/primitives";
import { ConfirmSheet, Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/errors";
import { useSettings } from "@/lib/data/hooks";
import { refreshAll, updateSettings } from "@/lib/data/mutations";
import { useHousehold } from "@/lib/household/hooks";
import { inviteMember, removeMember, renameHousehold, updateDisplayName } from "@/lib/household/mutations";
import type { HouseholdMember } from "@/lib/household/types";
import { SettingsGroup, SettingsHeader } from "./settings-ui";

export function HouseholdSettings() {
  const toast = useToast();
  const { household, members, me, isOwner, isLoading } = useHousehold();
  const { data: settings } = useSettings();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<HouseholdMember | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading && !household) return <div className="mx-auto max-w-2xl"><SettingsHeader title="Household" /></div>;
  if (!household || !me) {
    return (
      <div className="mx-auto max-w-2xl">
        <SettingsHeader title="Household" />
        <p className="text-[15px] text-ink-2">
          You&apos;re not in a household yet.{" "}
          <Link href="/household" className="font-semibold text-accent">
            Create one
          </Link>{" "}
          or ask a family member to add you.
        </p>
      </div>
    );
  }

  async function savePref(patch: Parameters<typeof updateSettings>[0]) {
    try {
      await updateSettings(patch);
      await refreshAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsHeader title="Household" />

      <SettingsGroup title="Details">
        <InlineEdit
          label="Household name"
          value={household.name}
          disabled={!isOwner}
          onSave={async (v) => {
            await renameHousehold(household.id, v);
            toast.success("Household renamed");
          }}
        />
        <InlineEdit
          label="Your name"
          value={me.display_name}
          onSave={async (v) => {
            await updateDisplayName(household.id, me.user_id, v);
            toast.success("Name updated");
          }}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Members"
        footer="Members share the shopping list, pantry and purchase history. Personal finances (budget, transactions, analytics) are never shared."
      >
        {members.map((m) => (
          <div key={m.user_id} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-ink-2">
              {m.role === "owner" ? <Crown className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px]">
                {m.display_name}
                {m.user_id === me.user_id ? <span className="text-ink-3"> (you)</span> : null}
              </span>
              <span className="block text-[12px] text-ink-3">{m.role === "owner" ? "Owner" : "Member"}</span>
            </span>
            {isOwner && m.user_id !== me.user_id ? (
              <button type="button" aria-label={`Remove ${m.display_name}`} onClick={() => setRemoving(m)} className="grid h-9 w-9 place-items-center rounded-full text-ink-3 hover:bg-negative-soft hover:text-negative">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
        {isOwner ? (
          <button type="button" onClick={() => setInviting(true)} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[15px] font-medium text-accent hover:bg-surface-2">
            <UserPlus className="h-5 w-5" /> Add family member
          </button>
        ) : (
          <button type="button" onClick={() => setRemoving(me)} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[15px] font-medium text-negative hover:bg-surface-2">
            <LogOut className="h-5 w-5" /> Leave household
          </button>
        )}
      </SettingsGroup>

      {settings ? (
        <SettingsGroup title="Notify me when" footer="Turn on notifications for this device in Settings → Notifications.">
          <ToggleRow label="Someone adds to the shopping list" checked={settings.notify_household_requests} onChange={(v) => savePref({ notify_household_requests: v })} />
          <ToggleRow label="Something on the list is bought" checked={settings.notify_household_purchases} onChange={(v) => savePref({ notify_household_purchases: v })} />
          <ToggleRow label="Items are about to run out (morning)" checked={settings.notify_household_predictions} onChange={(v) => savePref({ notify_household_predictions: v })} />
        </SettingsGroup>
      ) : null}

      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
      <ConfirmSheet
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        loading={busy}
        destructive
        confirmLabel={removing?.user_id === me.user_id ? "Leave" : "Remove"}
        title={removing?.user_id === me.user_id ? "Leave this household?" : `Remove ${removing?.display_name}?`}
        body={
          removing?.user_id === me.user_id
            ? "You'll stop seeing the shared list. You can be added back later."
            : "They lose access to the shared list and pantry. Their account and anything they recorded stay."
        }
        onConfirm={async () => {
          if (!removing) return;
          setBusy(true);
          try {
            await removeMember(household.id, removing.user_id);
            toast.show(removing.user_id === me.user_id ? "You left the household" : `${removing.display_name} removed`);
            setRemoving(null);
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-2">
      <span className="text-[15px]">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function InlineEdit({ label, value, onSave, disabled }: { label: string; value: string; onSave: (v: string) => Promise<void>; disabled?: boolean }) {
  const toast = useToast();
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const dirty = draft.trim() !== value && draft.trim().length > 0;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <label className="w-32 shrink-0 text-[15px]">{label}</label>
      <Input value={draft} disabled={disabled} maxLength={60} onChange={(e) => setDraft(e.target.value)} className="h-10" aria-label={label} />
      {dirty ? (
        <Button
          size="sm"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(draft.trim());
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          Save
        </Button>
      ) : null}
    </div>
  );
}

function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Add family member" description="They'll only see the Household section.">
      {open ? <InviteForm onDone={onClose} /> : null}
    </Sheet>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="space-y-4 text-[15px] leading-relaxed text-ink-2">
        <p className="rounded-2xl bg-positive-soft px-4 py-3 font-medium text-positive">{name} is now in your household.</p>
        {done.created ? (
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>On their iPhone, open this app&apos;s address in Safari.</li>
            <li>
              Sign in with <b className="text-ink">{email}</b> and the password you just set.
            </li>
            <li>Share → Add to Home Screen, open it, and turn on notifications.</li>
            <li>They can change their password in Settings → Sign-in & security.</li>
          </ol>
        ) : (
          <p>They already had an account — they&apos;ll see the Household section next time they open the app.</p>
        )}
        <Button size="lg" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (!name.trim()) return setError("Enter their name");
        if (!email.includes("@")) return setError("Enter a valid email");
        if (password.length < 8) return setError("Use a password of at least 8 characters");
        setBusy(true);
        try {
          setDone(await inviteMember({ name: name.trim(), email: email.trim(), password }));
          toast.success("Member added");
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Name" htmlFor="inv-name">
        <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Sadia" data-autofocus />
      </Field>
      <Field label="Their email" htmlFor="inv-email">
        <Input id="inv-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password for their account" htmlFor="inv-pw" hint="No email confirmation needed — share this password with them in person.">
        <div className="relative">
          <Input id="inv-pw" type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12" />
          <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-ink-3">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      {error ? <p role="alert" className="text-[13px] text-negative">{error}</p> : null}
      <Button type="submit" size="lg" loading={busy}>
        Add to household
      </Button>
      <p className="text-[12px] text-ink-3">
        If they already have a myFin account, they&apos;re added to your household and the password is ignored. Sign-ups can stay disabled — the account is created by the server.
      </p>
    </form>
  );
}
