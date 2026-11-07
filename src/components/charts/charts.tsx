"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/cn";
import { monthShort } from "@/lib/dates";
import { useCurrency } from "@/lib/data/hooks";
import type { BudgetComparison, CategorySlice, MonthPoint } from "@/lib/finance/analytics";
import { formatMoney } from "@/lib/money";

// ---------------------------------------------------------------------------
// Theme colors (read from CSS variables; re-read when the theme flips)
// ---------------------------------------------------------------------------
const VARS = [
  "--series-1", "--series-2", "--series-3", "--series-4", "--series-5", "--series-6", "--series-7", "--series-8",
  "--series-other", "--income", "--expense", "--grid", "--axis", "--surface", "--ink", "--ink-2", "--ink-3",
  "--diverge-under", "--diverge-over", "--border-strong",
] as const;
type ChartColors = Record<(typeof VARS)[number], string>;

function readColors(): ChartColors {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(VARS.map((v) => [v, cs.getPropertyValue(v).trim()])) as ChartColors;
}

function subscribeTheme(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

/** Chart colors for the active theme (null during server render). */
export function useChartColors(): ChartColors | null {
  const theme = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.dataset.theme ?? "light",
    () => null,
  );
   
  return useMemo(() => (theme ? readColors() : null), [theme]);
}

export const seriesColor = (c: ChartColors, i: number, isOther = false) =>
  isOther ? c["--series-other"] : c[`--series-${(i % 8) + 1}` as keyof ChartColors];

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
function TooltipCard({ title, rows }: { title: string; rows: Array<{ label: string; value: string; color?: string }> }) {
  return (
    <div className="min-w-[160px] rounded-xl border border-line bg-surface px-3 py-2.5 text-[12.5px] shadow-float">
      <p className="mb-1.5 font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            {r.color ? <span className="h-2 w-2 rounded-full" style={{ background: r.color }} /> : null}
            {r.label}
          </span>
          <span className="font-semibold tabular text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items, className }: { items: Array<{ label: string; color: string }>; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2", className)}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  );
}

const axisTick = (c: ChartColors) => ({ fill: c["--axis"], fontSize: 11 });

// ---------------------------------------------------------------------------
// Income vs expense by month
// ---------------------------------------------------------------------------
export function CashflowChart({ points, height = 240 }: { points: MonthPoint[]; height?: number }) {
  const c = useChartColors();
  const currency = useCurrency();
  if (!c) return <div style={{ height }} />;
  const data = points.map((p) => ({ ...p, label: monthShort(p.period), incomeV: p.income / 100, expenseV: p.expense / 100 }));
  return (
    <div>
      <Legend
        className="mb-3"
        items={[
          { label: "Income received", color: c["--income"] },
          { label: "Expenses paid", color: c["--expense"] },
        ]}
      />
      <div style={{ height }} role="img" aria-label="Income versus expenses by month">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c["--grid"]} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: c["--border-strong"] }} tick={axisTick(c)} />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              tick={axisTick(c)}
              tickFormatter={(v: number) => formatMoney(v * 100, { compact: true, bare: true })}
            />
            <Tooltip
              cursor={{ fill: c["--grid"], opacity: 0.5 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <TooltipCard
                    title={monthShort(p.period) + " " + p.period.slice(0, 4)}
                    rows={[
                      { label: "Income", value: formatMoney(p.income, { currency }), color: c["--income"] },
                      { label: "Expenses", value: formatMoney(p.expense, { currency }), color: c["--expense"] },
                      { label: p.savings >= 0 ? "Saved" : "Overspent", value: formatMoney(Math.abs(p.savings), { currency }) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="incomeV" name="Income" fill={c["--income"]} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expenseV" name="Expenses" fill={c["--expense"]} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Savings trend
// ---------------------------------------------------------------------------
export function SavingsChart({ points, height = 220 }: { points: MonthPoint[]; height?: number }) {
  const c = useChartColors();
  const currency = useCurrency();
  if (!c) return <div style={{ height }} />;
  const data = points.map((p, i) => ({
    ...p,
    label: monthShort(p.period),
    savingsV: p.savings / 100,
    cumulative: points.slice(0, i + 1).reduce((s, x) => s + x.savings, 0),
  }));
  return (
    <div style={{ height }} role="img" aria-label="Monthly savings trend">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="savingsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c["--series-1"]} stopOpacity={0.22} />
              <stop offset="100%" stopColor={c["--series-1"]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={c["--grid"]} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick(c)} />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={axisTick(c)}
            tickFormatter={(v: number) => formatMoney(v * 100, { compact: true, bare: true })}
          />
          <ReferenceLine y={0} stroke={c["--border-strong"]} />
          <Tooltip
            cursor={{ stroke: c["--ink-3"], strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <TooltipCard
                  title={monthShort(p.period) + " " + p.period.slice(0, 4)}
                  rows={[
                    { label: p.savings >= 0 ? "Saved" : "Overspent", value: formatMoney(p.savings, { currency, signed: true }), color: c["--series-1"] },
                    { label: "Year to date", value: formatMoney(p.cumulative, { currency, signed: true }) },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="savingsV"
            stroke={c["--series-1"]}
            strokeWidth={2}
            fill="url(#savingsFill)"
            dot={{ r: 3.5, fill: c["--series-1"], stroke: c["--surface"], strokeWidth: 2 }}
            activeDot={{ r: 5, fill: c["--series-1"], stroke: c["--surface"], strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category donut with value legend (legend doubles as the table view)
// ---------------------------------------------------------------------------
export function CategoryDonut({ slices, total }: { slices: CategorySlice[]; total: number }) {
  const c = useChartColors();
  const currency = useCurrency();
  const [active, setActive] = useState<number | null>(null);
  if (!c) return <div className="h-56" />;
  const colorOf = (i: number) => seriesColor(c, i, slices[i].categoryId === "__other");
  const shown = active !== null ? slices[active] : null;
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
      <div className="relative mx-auto h-[200px] w-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices.map((s) => ({ ...s, value: s.amount }))}
              dataKey="value"
              nameKey="name"
              innerRadius={66}
              outerRadius={96}
              paddingAngle={slices.length > 1 ? 1.2 : 0}
              stroke={c["--surface"]}
              strokeWidth={2}
              cornerRadius={4}
              startAngle={90}
              endAngle={-270}
              isAnimationActive
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {slices.map((s, i) => (
                <Cell key={s.categoryId ?? s.name} fill={colorOf(i)} opacity={active === null || active === i ? 1 : 0.35} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="max-w-[110px] truncate text-[11px] font-medium text-ink-3">{shown ? shown.name : "Total spent"}</span>
          <span className="text-[17px] font-bold tabular tracking-[-0.02em]">
            {formatMoney(shown ? shown.amount : total, { currency, compact: true })}
          </span>
          {shown ? <span className="text-[11px] text-ink-3">{Math.round(shown.share * 100)}%</span> : null}
        </div>
      </div>
      <ul className="space-y-1">
        {slices.map((s, i) => (
          <li
            key={s.categoryId ?? s.name}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13px] transition-colors", active === i && "bg-surface-2")}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: colorOf(i) }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ink-2">{s.name}</span>
            <span className="w-10 text-right text-[12px] text-ink-3 tabular">{Math.round(s.share * 100)}%</span>
            <span className="w-24 text-right font-semibold tabular">{formatMoney(s.amount, { currency })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Budget variance (diverging horizontal bars)
// ---------------------------------------------------------------------------
export function VarianceChart({ rows }: { rows: BudgetComparison[] }) {
  const c = useChartColors();
  const currency = useCurrency();
  if (!c) return <div className="h-64" />;
  const data = rows
    .filter((r) => r.variance !== 0)
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 12)
    .map((r) => ({ ...r, v: r.variance / 100 }));
  if (!data.length) return <p className="py-8 text-center text-[13px] text-ink-3">Spending matched the budget exactly.</p>;
  const height = Math.max(160, data.length * 34 + 30);
  return (
    <div>
      <Legend
        className="mb-3"
        items={[
          { label: "Under budget", color: c["--diverge-under"] },
          { label: "Over budget", color: c["--diverge-over"] },
        ]}
      />
      <div style={{ height }} role="img" aria-label="Budget variance by category">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke={c["--grid"]} />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tick={axisTick(c)}
              tickFormatter={(v: number) => formatMoney(v * 100, { compact: true, bare: true })}
            />
            <YAxis type="category" dataKey="name" width={118} tickLine={false} axisLine={false} tick={{ ...axisTick(c), fill: c["--ink-2"] }} />
            <ReferenceLine x={0} stroke={c["--border-strong"]} />
            <Tooltip
              cursor={{ fill: c["--grid"], opacity: 0.5 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <TooltipCard
                    title={p.name}
                    rows={[
                      { label: "Budget", value: formatMoney(p.budget, { currency }) },
                      { label: "Actual", value: formatMoney(p.actual, { currency }) },
                      {
                        label: p.variance > 0 ? "Over" : "Under",
                        value: formatMoney(Math.abs(p.variance), { currency }),
                        color: p.variance > 0 ? c["--diverge-over"] : c["--diverge-under"],
                      },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="v" radius={4} maxBarSize={18}>
              {data.map((d) => (
                <Cell key={d.categoryId} fill={d.variance > 0 ? c["--diverge-over"] : c["--diverge-under"]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
