"use client";

import { Check, ChevronDown, Home, Pencil, Plus, Search, ShoppingBasket, Sparkles, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { NotificationCard } from "@/components/settings/notification-card";
import { Money } from "@/components/ui/money";
import { Button, Card, CardHeader, EmptyState, Field, Input, Pill, ProgressBar, Segmented, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { addMonths, formatDate, monthLabel, monthShort, periodOf, timeAgo } from "@/lib/dates";
import { useSession } from "@/lib/data/app-context";
import { errorMessage } from "@/lib/data/errors";
import { useProfile, useSettings, useToday } from "@/lib/data/hooks";
import { useHousehold, useHouseholdData, type ItemView } from "@/lib/household/hooks";
import { createHousehold, requestItem } from "@/lib/household/mutations";
import { formatQty } from "@/lib/household/predict";
import type { HouseholdMember } from "@/lib/household/types";
import { toMinor } from "@/lib/money";
import { pushConfigured } from "@/lib/push-client";
import { Catalog } from "./catalog";
import { CatalogItemSheet, type CatalogEditTarget } from "./catalog-item-sheet";
import { ItemDetailSheet } from "./item-detail-sheet";
import { ItemImage } from "./item-image";
import { PurchaseSheet } from "./purchase-sheet";
import { RequestSheet, type RequestTarget } from "./request-sheet";
import { StockPill, stockLevel } from "./stock";

type Tab = "list" | "catalog" | "pantry" | "insights";

function initialTab(fallback: Tab): Tab {
  const params = new URLSearchParams(window.location.search);
  if (params.get("add")) return "catalog";
  const t = params.get("tab");
  return t === "pantry" || t === "insights" || t === "catalog" || t === "list" ? t : fallback;
}

export function HouseholdView() {
  const { household, members, me, isLoading } = useHousehold();
  if (isLoading && !household) {
    return (
      <>
        <PageHeader title="Household" />
        <Skeleton className="h-64" />
      </>
    );
  }
  if (!household || !me) return <SetupHousehold />;
  return <HouseholdHome householdId={household.id} householdName={household.name} members={members} me={me} />;
}

function SetupHousehold() {
  const toast = useToast();
  const { user } = useSession();
  const { data: profile } = useProfile();
  const [name, setName] = useState("Our Home");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const shownName = displayName || profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "";
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Household" />
      <Card className="p-6">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Home className="h-6 w-6" />
        </div>
        <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Shared shopping list</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
          Your family adds what&apos;s running low, you get notified instantly, and myFin learns how long things last so it can remind you before they run out.
          Your finances stay private.
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || !shownName.trim()) return toast.error("Enter both names");
            setBusy(true);
            try {
              await createHousehold(name.trim(), shownName.trim());
              toast.success("Household created — now add your family in Settings → Household");
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Household name" htmlFor="hh-name">
            <Input id="hh-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Your name (shown to family)" htmlFor="hh-me">
            <Input id="hh-me" value={shownName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" loading={busy}>
            Create household
          </Button>
        </form>
        <p className="mt-4 text-[12.5px] text-ink-3">Joining someone else&apos;s household? Ask them to add you from Settings → Household.</p>
      </Card>
    </div>
  );
}

function HouseholdHome({
  householdId,
  householdName,
  members,
  me,
}: {
  householdId: string;
  householdName: string;
  members: HouseholdMember[];
  me: HouseholdMember;
}) {
  const today = useToday();
  const toast = useToast();
  const { views, data, isLoading } = useHouseholdData(householdId);
  const financeUser = useSettings().data?.finance_enabled !== false;
  // family members mostly add things, so they start on the catalogue
  const [tab, setTab] = useState<Tab>(() => initialTab(financeUser ? "list" : "catalog"));
  const [requestTarget, setRequestTarget] = useState<RequestTarget | null>(null);
  const [editTarget, setEditTarget] = useState<CatalogEditTarget | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    const open = () => setTab("catalog");
    window.addEventListener("myfin:add-shopping", open);
    if (new URLSearchParams(window.location.search).get("add")) window.history.replaceState(null, "", "/household");
    return () => window.removeEventListener("myfin:add-shopping", open);
  }, []);

  const all = useMemo(() => views ?? [], [views]);
  const active = all.filter((v) => !v.item.is_archived);
  const onList = active
    .filter((v) => v.openRequest)
    .sort(
      (a, b) =>
        Number(b.openRequest!.urgency === "urgent") - Number(a.openRequest!.urgency === "urgent") ||
        b.openRequest!.requested_at.localeCompare(a.openRequest!.requested_at),
    );
  const suggestions = active
    .filter((v) => !v.openRequest && (v.prediction.status === "soon" || v.prediction.status === "out"))
    .sort((a, b) => (a.prediction.daysLeft ?? 0) - (b.prediction.daysLeft ?? 0));
  const stores = useMemo(() => [...new Set((data?.purchases ?? []).map((p) => p.store).filter(Boolean) as string[])], [data?.purchases]);
  const who = (id: string | null) => (id === me.user_id ? "You" : (members.find((m) => m.user_id === id)?.display_name ?? "Someone"));

  async function quickAdd(v: ItemView) {
    setAdding(v.item.id);
    try {
      await requestItem({ itemId: v.item.id, qty: v.prediction.suggestedQty, urgency: v.prediction.status === "out" ? "urgent" : "normal" });
      toast.success(`${v.item.name} added to the list`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAdding(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Household"
        subtitle={
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> {householdName} · {members.map((m) => m.display_name).join(", ")}
          </span>
        }
        actions={
          <Button
            size="icon"
            aria-label={tab === "catalog" ? "New catalogue item" : "Add to shopping list"}
            onClick={() => (tab === "catalog" ? setEditTarget({ create: true }) : setTab("catalog"))}
          >
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      <Segmented
        className="mb-4 w-full sm:w-auto"
        value={tab}
        onChange={setTab}
        options={[
          { value: "list", label: `List${onList.length ? ` · ${onList.length}` : ""}` },
          { value: "catalog", label: "Add items" },
          { value: "pantry", label: "Pantry" },
          { value: "insights", label: "Insights" },
        ]}
      />

      {isLoading && !views ? (
        <Skeleton className="h-64" />
      ) : tab === "list" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            {suggestions.length ? (
              <Card className="overflow-hidden border-warning/30">
                <CardHeader
                  title={
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-warning" /> Running low soon
                    </span>
                  }
                  subtitle="Based on how quickly you use them"
                />
                <ul className="mt-2 divide-y divide-line">
                  {suggestions.map((v) => (
                    <li key={v.item.id} className="flex items-center gap-3 px-5 py-3">
                      <ItemImage item={v.item} />
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(v.item.id)}>
                        <p className="truncate text-[15px] font-medium">
                          {v.item.name}
                          {v.item.name_bn ? <span className="font-normal text-ink-3"> · {v.item.name_bn}</span> : null}
                        </p>
                        <p className="text-[12.5px] text-ink-3">
                          {v.prediction.status === "out" ? "Probably finished" : `About ${v.prediction.daysLeft} day${v.prediction.daysLeft === 1 ? "" : "s"} left`}
                          {v.prediction.suggestedQty ? ` · usually ${formatQty(v.prediction.suggestedQty, v.item.unit)}` : ""}
                        </p>
                      </button>
                      <Button size="sm" variant="tinted" loading={adding === v.item.id} onClick={() => quickAdd(v)}>
                        <Plus className="h-4 w-4" /> Add
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card className="overflow-hidden">
              {onList.length === 0 ? (
                <EmptyState
                  icon={<ShoppingBasket className="h-6 w-6" />}
                  title="The list is empty"
                  body="Add anything that's running low — everyone in the household gets notified."
                  action={
                    <Button size="sm" onClick={() => setTab("catalog")}>
                      <Plus className="h-4 w-4" /> Add item
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-line">
                  {onList.map((v) => {
                    const r = v.openRequest!;
                    return (
                      <li key={r.id} className="flex items-center gap-1 pr-2">
                        <button
                          type="button"
                          aria-label={`Mark ${v.item.name} as bought`}
                          onClick={() => setBuyingId(v.item.id)}
                          className="group flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left transition hover:bg-surface-2 active:bg-surface-3/60 sm:pl-5"
                        >
                          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border-2 border-line-strong bg-surface transition group-hover:border-positive group-active:scale-90">
                            <Check className="h-4 w-4 text-positive opacity-0 transition group-hover:opacity-60" strokeWidth={3} />
                          </span>
                          <ItemImage item={v.item} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[15px] font-medium">{v.item.name_bn ?? v.item.name}</span>
                              {r.urgency === "urgent" ? <Pill tone="negative">Urgent</Pill> : null}
                            </span>
                            <span className="block truncate text-[12.5px] text-ink-3">
                              {v.item.name_bn ? `${v.item.name} · ` : ""}
                              {who(r.requested_by)} · {timeAgo(r.requested_at)}
                              {r.note ? ` · ${r.note}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-[15px] font-semibold tabular">{r.qty ? formatQty(r.qty, v.item.unit) : ""}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Change ${v.item.name}`}
                          onClick={() => setRequestTarget({ request: r })}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <RecentlyBought views={active} who={who} />
          </div>
          <aside className="space-y-4">
            <NotificationCard compact />
            <Card className="p-5 text-[13px] leading-relaxed text-ink-2">
              <p className="font-semibold text-ink">How forecasts work</p>
              <p className="mt-1">
                Each time you mark something bought (with quantity), and each time it&apos;s added back to the list, myFin learns how long that quantity lasts.
                After a couple of rounds it predicts when it will run out and suggests it here{pushConfigured ? " and in a morning notification" : ""}.
              </p>
            </Card>
          </aside>
        </div>
      ) : tab === "catalog" ? (
        <Catalog
          views={all}
          onEditRequest={(v) => v.openRequest && setRequestTarget({ request: v.openRequest })}
          onEditItem={(v) => setEditTarget({ item: v.item })}
          onNewItem={(category) => setEditTarget({ create: true, category })}
        />
      ) : tab === "pantry" ? (
        <Pantry views={all} onOpen={(id) => setDetailId(id)} />
      ) : (
        <Insights views={active} today={today} />
      )}

      <RequestSheet target={requestTarget} views={all} onClose={() => setRequestTarget(null)} />
      <PurchaseSheet view={all.find((v) => v.item.id === buyingId) ?? null} stores={stores} onClose={() => setBuyingId(null)} />
      <CatalogItemSheet target={editTarget} householdId={householdId} onClose={() => setEditTarget(null)} />
      <ItemDetailSheet
        view={all.find((v) => v.item.id === detailId) ?? null}
        members={members}
        onClose={() => setDetailId(null)}
        onEdit={(v) => {
          setDetailId(null);
          setEditTarget({ item: v.item });
        }}
        onAddToList={(v) => {
          setDetailId(null);
          setRequestTarget({ itemId: v.item.id });
        }}
        onBought={(v) => {
          setDetailId(null);
          setBuyingId(v.item.id);
        }}
      />
    </>
  );
}

function RecentlyBought({ views, who }: { views: ItemView[]; who: (id: string | null) => string }) {
  const [open, setOpen] = useState(false);
  const recent = views
    .flatMap((v) => v.purchases.map((p) => ({ v, p })))
    .sort((a, b) => b.p.purchased_on.localeCompare(a.p.purchased_on) || b.p.created_at.localeCompare(a.p.created_at))
    .slice(0, 15);
  if (!recent.length) return null;
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-3.5 text-[13px] font-semibold text-ink-3 hover:bg-surface-2">
        <span>Recently bought</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ul className="divide-y divide-line border-t border-line">
          {recent.map(({ v, p }) => (
            <li key={p.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px]">
                  {v.item.name} <span className="text-ink-3">· {formatQty(p.qty, v.item.unit)}</span>
                </p>
                <p className="text-[12px] text-ink-3">
                  {formatDate(p.purchased_on)} · {who(p.purchased_by)}
                  {p.store ? ` · ${p.store}` : ""}
                </p>
              </div>
              {p.total_price !== null ? <Money value={toMinor(p.total_price)} className="text-[14px] font-medium" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function Pantry({ views, onOpen }: { views: ItemView[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const order = { out: 0, soon: 1, ok: 2, learning: 3 } as const;
  const list = views
    .filter((v) => v.item.is_archived === showArchived && v.item.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => order[a.prediction.status] - order[b.prediction.status] || (a.prediction.daysLeft ?? 999) - (b.prediction.daysLeft ?? 999) || a.item.name.localeCompare(b.item.name));
  const archived = views.filter((v) => v.item.is_archived).length;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items" aria-label="Search pantry" className="h-11 pl-10" />
        </div>
        {archived || showArchived ? (
          <Button variant="secondary" className="h-11" onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? "Active" : `Archived (${archived})`}
          </Button>
        ) : null}
      </div>
      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <EmptyState icon={<ShoppingBasket className="h-6 w-6" />} title={query ? "No matching items" : "No items yet"} body="Items appear here once they're added to the shopping list." />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((v) => {
              const level = stockLevel(v);
              return (
                <li key={v.item.id}>
                  <button type="button" onClick={() => onOpen(v.item.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 sm:px-5">
                    <ItemImage item={v.item} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[15px] font-medium">
                          {v.item.name}
                          {v.item.name_bn ? <span className="font-normal text-ink-3"> · {v.item.name_bn}</span> : null}
                        </p>
                        <StockPill view={v} />
                      </div>
                      <p className="truncate text-[12.5px] text-ink-3">
                        {v.item.category ? `${v.item.category} · ` : ""}
                        {v.purchases[0] ? `Bought ${formatDate(v.purchases[0].purchased_on)}` : "Not bought yet"}
                        {v.price.lastUnitPrice !== null ? (
                          <>
                            {" · "}
                            <Money value={v.price.lastUnitPrice} />/{v.item.unit}
                          </>
                        ) : null}
                      </p>
                      {level !== null ? (
                        <ProgressBar
                          value={level}
                          className="mt-2 h-1.5"
                          color={v.prediction.status === "ok" ? "var(--positive)" : v.prediction.status === "soon" ? "var(--warning)" : "var(--negative)"}
                          label={`${v.item.name} stock`}
                        />
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Insights({ views, today }: { views: ItemView[]; today: string }) {
  const finance = useSettings().data?.finance_enabled !== false;
  const current = periodOf(today);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(current, i - 5));
  const purchases = views.flatMap((v) => v.purchases.map((p) => ({ v, p })));
  const byMonth = months.map((m) => ({
    period: m,
    total: purchases.filter(({ p }) => p.purchased_on.startsWith(m.slice(0, 7))).reduce((s, { p }) => s + (p.total_price === null ? 0 : toMinor(p.total_price)), 0),
  }));
  const max = Math.max(1, ...byMonth.map((m) => m.total));
  const since90 = addMonths(current, -2);
  const top = views
    .map((v) => ({
      v,
      spent: v.purchases.filter((p) => p.purchased_on >= since90).reduce((s, p) => s + (p.total_price === null ? 0 : toMinor(p.total_price)), 0),
    }))
    .filter((x) => x.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 8);
  const risers = views.filter((v) => v.price.change !== null && v.price.change >= 0.05).sort((a, b) => (b.price.change ?? 0) - (a.price.change ?? 0));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Household spending" subtitle={`${monthLabel(current)} · last 6 months`} />
        <div className="px-5 pb-5">
          <Money value={byMonth.at(-1)!.total} className="text-[28px] font-bold tracking-[-0.03em]" />
          <div className="mt-4 flex h-36 items-end gap-2" role="img" aria-label="Household spending, last 6 months">
            {byMonth.map((m) => (
              <div key={m.period} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-[4px] bg-expense transition-[height] duration-700"
                    style={{ height: `${Math.max(m.total ? 4 : 0, (m.total / max) * 100)}%`, opacity: m.period === current ? 1 : 0.55 }}
                    title={`${monthLabel(m.period)}`}
                  />
                </div>
                <span className="text-[11px] text-ink-3">{monthShort(m.period)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Top items" subtitle="Last 3 months" />
        <div className="px-5 pb-5 pt-3">
          {top.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-3">Add prices when you mark items bought to see where the money goes.</p>
          ) : (
            <ul className="space-y-3">
              {top.map(({ v, spent }) => (
                <li key={v.item.id}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span className="truncate text-ink-2">{v.item.name}</span>
                    <Money value={spent} className="font-semibold" />
                  </div>
                  <ProgressBar value={spent / top[0].spent} color="var(--expense)" className="h-1.5" label={v.item.name} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader
          title={
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-negative" /> Price increases
            </span>
          }
          subtitle="Latest price vs. your earlier purchases"
        />
        <div className="px-5 pb-5 pt-3">
          {risers.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-ink-3">No notable price increases.</p>
          ) : (
            <ul className="divide-y divide-line">
              {risers.map((v) => (
                <li key={v.item.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                  <span className="min-w-0 truncate">{v.item.name}</span>
                  <span className="shrink-0 text-ink-3">
                    <Money value={v.price.lastUnitPrice!} />/{v.item.unit} <span className="font-semibold text-negative">+{Math.round(v.price.change! * 100)}%</span>
                    {v.price.cheapest?.store ? <span className="hidden sm:inline"> · cheapest at {v.price.cheapest.store}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      {finance ? (
        <p className="text-[12px] text-ink-3 lg:col-span-2">
          Purchases you add to your expenses also appear in{" "}
          <Link href="/transactions" className="font-medium text-accent">
            Transactions
          </Link>{" "}
          under Groceries.
        </p>
      ) : null}
    </div>
  );
}
