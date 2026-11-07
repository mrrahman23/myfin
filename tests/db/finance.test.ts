import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, createUser, num, type TestDb } from "./harness";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

let db: TestDb;
let m0: string; // seed month (current month in Asia/Dhaka)
let m1: string; // next month
let m2: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;

async function obligation(user: string, name: string, period: string) {
  const rows = await as(db, user, () =>
    q<{ id: string; outstanding: string; paid_amount: string; carried_in: string; amount_due: string }>(
      `select id, outstanding, paid_amount, carried_in, amount_due from obligation_status where name = $1 and period = $2`,
      [name, period],
    ),
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function pay(user: string, obligationId: string, amount: number | null, date?: string, ref?: string) {
  return as(db, user, async () => {
    const r = await q<{ id: string }>(
      `select record_payment($1, $2, $3::date, null, null, $4) as id`,
      [obligationId, amount, date ?? null, ref ?? null],
    );
    return r[0].id;
  });
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, A, "Alice");
  await createUser(db, B, "Bob");
  const r = await q<{ m0: string; m1: string; m2: string }>(
    `select to_char(date_trunc('month', user_today($1)), 'YYYY-MM-DD') m0,
            to_char(date_trunc('month', user_today($1)) + interval '1 month', 'YYYY-MM-DD') m1,
            to_char(date_trunc('month', user_today($1)) + interval '2 month', 'YYYY-MM-DD') m2`,
    [A],
  );
  ({ m0, m1, m2 } = r[0]);
}, 60_000);

describe("seeding & month generation", () => {
  it("seeds categories, recurring rules, settings and payment methods for a new user", async () => {
    const counts = await as(db, A, () =>
      q<{ cats: string; rules: string; methods: string; settings: string; name: string }>(`
        select (select count(*) from categories) cats,
               (select count(*) from recurring_rules) rules,
               (select count(*) from payment_methods) methods,
               (select count(*) from user_settings) settings,
               (select full_name from profiles) name`),
    );
    expect(counts[0]).toMatchObject({ cats: 20, rules: 20, methods: 4, settings: 1, name: "Alice" });
  });

  it("generates obligations from recurring rules exactly once", async () => {
    await as(db, A, () => q(`select ensure_month($1)`, [m0]));
    await as(db, A, () => q(`select ensure_month($1)`, [m0]));
    await as(db, A, () => q(`select ensure_month($1::date + 14)`, [m0])); // mid-month date normalises
    const rows = await as(db, A, () =>
      q<{ n: string; income: string; expense: string }>(
        `select count(*) n,
                sum(budget_amount) filter (where kind='income') income,
                sum(budget_amount) filter (where kind='expense') expense
         from obligations where period = $1`,
        [m0],
      ),
    );
    expect(num(rows[0].n)).toBe(20);
    expect(num(rows[0].income)).toBe(410000);
    expect(num(rows[0].expense)).toBe(400500);
  });

  it("does not resurrect a deleted generated item when the month is reopened", async () => {
    await as(db, B, () => q(`select ensure_month($1)`, [m0]));
    await as(db, B, () => q(`delete from obligations where name = 'Teacher Payment' and period = $1`, [m0]));
    await as(db, B, () => q(`select ensure_month($1)`, [m0]));
    const rows = await as(db, B, () =>
      q(`select 1 from obligations where name = 'Teacher Payment' and period = $1`, [m0]),
    );
    expect(rows).toHaveLength(0);
  });

  it("does not generate for months before a rule starts", async () => {
    const before = await as(db, A, async () => {
      await q(`select ensure_month(($1::date - interval '1 month')::date)`, [m0]);
      return q(`select 1 from obligations where period = ($1::date - interval '1 month')::date`, [m0]);
    });
    expect(before).toHaveLength(0);
  });
});

describe("recurrence rules", () => {
  const occ = async (args: string) =>
    (await q<{ d: string }>(`select to_char(d, 'YYYY-MM-DD') d from rule_occurrences(${args}) d`)).map((r) => r.d);

  it("monthly clamps day 31 to month end", async () => {
    expect(await occ(`'monthly', 1, null, 31, null, null, '2026-01-01', null, '2026-02-01'`)).toEqual(["2026-02-28"]);
  });
  it("every 3 months", async () => {
    expect(await occ(`'monthly', 3, null, 5, null, null, '2026-01-01', null, '2026-04-01'`)).toEqual(["2026-04-05"]);
    expect(await occ(`'monthly', 3, null, 5, null, null, '2026-01-01', null, '2026-05-01'`)).toEqual([]);
  });
  it("weekly on Fridays", async () => {
    expect(await occ(`'weekly', 1, null, null, 5, null, '2026-11-01', null, '2026-11-01'`)).toEqual([
      "2026-11-06",
      "2026-11-13",
      "2026-11-20",
      "2026-11-27",
    ]);
  });
  it("yearly in a given month", async () => {
    expect(await occ(`'yearly', 1, null, 15, null, 3, '2026-01-01', null, '2027-03-01'`)).toEqual(["2027-03-15"]);
    expect(await occ(`'yearly', 1, null, 15, null, 3, '2026-01-01', null, '2027-04-01'`)).toEqual([]);
  });
  it("custom every 10 days respects end date", async () => {
    expect(await occ(`'custom', 10, 'day', null, null, null, '2026-11-01', '2026-11-25', '2026-11-01'`)).toEqual([
      "2026-11-01",
      "2026-11-11",
      "2026-11-21",
    ]);
  });
});

describe("payments", () => {
  it("one-tap pay settles the full amount and refuses a duplicate", async () => {
    const rent = await obligation(A, "Rent", m0);
    await pay(A, rent.id, null);
    const after = await obligation(A, "Rent", m0);
    expect(num(after.outstanding)).toBe(0);
    expect(num(after.paid_amount)).toBe(35000);
    await expect(pay(A, rent.id, null)).rejects.toThrow(/already settled/);
  });

  it("is idempotent for the same client reference", async () => {
    const driver = await obligation(A, "Driver Salary", m0);
    const ref = "33333333-3333-4333-8333-333333333333";
    const t1 = await pay(A, driver.id, 10000, undefined, ref);
    const t2 = await pay(A, driver.id, 10000, undefined, ref);
    expect(t1).toBe(t2);
    expect(num((await obligation(A, "Driver Salary", m0)).paid_amount)).toBe(10000);
  });

  it("supports multiple partial payments", async () => {
    const loan = await obligation(A, "Personal Loan", m0);
    await pay(A, loan.id, 30000);
    let s = await obligation(A, "Personal Loan", m0);
    expect(num(s.outstanding)).toBe(20000);
    await pay(A, loan.id, 15000);
    s = await obligation(A, "Personal Loan", m0);
    expect(num(s.outstanding)).toBe(5000);
    await pay(A, loan.id, null);
    s = await obligation(A, "Personal Loan", m0);
    expect(num(s.outstanding)).toBe(0);
    expect(num(s.paid_amount)).toBe(50000);
  });

  it("variable actual amount does not change the budget", async () => {
    const gas = await obligation(A, "Gas Cylinders", m0);
    await as(db, A, () => q(`update obligations set actual_amount = 7200 where id = $1`, [gas.id]));
    const r = await as(db, A, () =>
      q<{ budget_amount: string; amount_due: string }>(
        `select budget_amount, amount_due from obligation_balances where id = $1`,
        [gas.id],
      ),
    );
    expect(num(r[0].budget_amount)).toBe(6500);
    expect(num(r[0].amount_due)).toBe(7200);
  });

  it("undo removes the payments recorded against an item", async () => {
    const teacher = await obligation(A, "Teacher Payment", m0);
    await pay(A, teacher.id, null);
    const n = await as(db, A, () => q<{ n: number }>(`select unmark_obligation($1) n`, [teacher.id]));
    expect(n[0].n).toBe(1);
    expect(num((await obligation(A, "Teacher Payment", m0)).outstanding)).toBe(3000);
  });

  it("editing a linked transaction re-allocates it", async () => {
    const khala = await obligation(A, "Khala Payment", m0);
    const txn = await pay(A, khala.id, 2000);
    await as(db, A, () => q(`update transactions set amount = 4500 where id = $1`, [txn]));
    expect(num((await obligation(A, "Khala Payment", m0)).outstanding)).toBe(500);
    await as(db, A, () => q(`delete from transactions where id = $1`, [txn]));
    expect(num((await obligation(A, "Khala Payment", m0)).outstanding)).toBe(5000);
  });

  it("rejects an expense payment against an income item", async () => {
    const salary = await obligation(A, "Salary", m0);
    await expect(
      as(db, A, () =>
        q(`insert into transactions (kind, amount, txn_date, obligation_id) values ('expense', 10, current_date, $1)`, [
          salary.id,
        ]),
      ),
    ).rejects.toThrow(/cannot settle/);
  });

  it("clients cannot write allocations directly", async () => {
    const rent = await obligation(A, "Rent", m0);
    const t = await as(db, A, () => q<{ id: string }>(`select id from transactions limit 1`));
    await expect(
      as(db, A, () =>
        q(`insert into payment_allocations (user_id, transaction_id, obligation_id, amount) values ($1,$2,$3,1)`, [
          A,
          t[0].id,
          rent.id,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("carry-forward", () => {
  it("matches the electricity example: 6,000 − 4,000, then 6,500 + 2,000, pay 5,000 → 3,500", async () => {
    const nov = await obligation(A, "Electricity Bill", m0);
    await pay(A, nov.id, 4000);
    expect(num((await obligation(A, "Electricity Bill", m0)).outstanding)).toBe(2000);

    await as(db, A, () => q(`select ensure_month($1)`, [m1]));
    const dec = await obligation(A, "Electricity Bill", m1);
    await as(db, A, () => q(`update obligations set actual_amount = 6500 where id = $1`, [dec.id]));

    let d = await obligation(A, "Electricity Bill", m1);
    expect(num(d.carried_in)).toBe(2000);
    expect(num(d.outstanding) + num(d.carried_in)).toBe(8500);

    const txn = await pay(A, dec.id, 5000);
    d = await obligation(A, "Electricity Bill", m1);
    const n = await obligation(A, "Electricity Bill", m0);
    expect(num(n.outstanding)).toBe(0); // November settled by the December payment
    expect(num(d.carried_in)).toBe(0);
    expect(num(d.outstanding)).toBe(3500);

    // history is preserved and linked to the original obligation
    const allocs = await as(db, A, () =>
      q<{ obligation_id: string; amount: string }>(
        `select obligation_id, amount from payment_allocations where transaction_id = $1 order by amount`,
        [txn],
      ),
    );
    expect(allocs.map((a) => [a.obligation_id, num(a.amount)])).toEqual([
      [nov.id, 2000],
      [dec.id, 3000],
    ]);
    // the payment itself is recorded once
    const total = await as(db, A, () =>
      q<{ s: string }>(`select sum(amount) s from transactions where category_id = (select category_id from obligations where id = $1)`, [dec.id]),
    );
    expect(num(total[0].s)).toBe(9000);
  });

  it("one-tap pay in the next month clears carried + current", async () => {
    await as(db, A, () => q(`select ensure_month($1)`, [m2]));
    const jan = await obligation(A, "Electricity Bill", m2);
    expect(num(jan.carried_in)).toBe(3500);
    await pay(A, jan.id, null);
    for (const m of [m0, m1, m2]) {
      expect(num((await obligation(A, "Electricity Bill", m)).outstanding)).toBe(0);
    }
  });

  it("does not carry when the category has carry-forward disabled", async () => {
    await as(db, A, () => q(`update categories set carry_forward = false where name = 'Breakfast Bill'`));
    const m0b = await obligation(A, "Breakfast Bill", m0);
    await pay(A, m0b.id, 1000);
    const next = await obligation(A, "Breakfast Bill", m1);
    expect(num(next.carried_in)).toBe(0);
    await pay(A, next.id, 5000);
    expect(num((await obligation(A, "Breakfast Bill", m0)).outstanding)).toBe(4000);
    expect(num((await obligation(A, "Breakfast Bill", m1)).outstanding)).toBe(0);
  });

  it("carries income receivables too", async () => {
    const lunch = await obligation(A, "Lunch Allowance", m0);
    await pay(A, lunch.id, 20000);
    const next = await obligation(A, "Lunch Allowance", m1);
    expect(num(next.carried_in)).toBe(10000);
    await pay(A, next.id, null);
    expect(num((await obligation(A, "Lunch Allowance", m0)).outstanding)).toBe(0);
    expect(num((await obligation(A, "Lunch Allowance", m1)).paid_amount)).toBe(30000);
  });

  it("paying an older month afterwards shrinks the later carried amount", async () => {
    const m0s = await obligation(A, "Mom Pocket Money", m0);
    await pay(A, m0s.id, 1000);
    expect(num((await obligation(A, "Mom Pocket Money", m1)).carried_in)).toBe(4000);
    await pay(A, m0s.id, 4000);
    expect(num((await obligation(A, "Mom Pocket Money", m1)).carried_in)).toBe(0);
  });
});

describe("budget tools", () => {
  it("update budget for future months updates the rule and later items only", async () => {
    const m1Rent = await obligation(A, "Rent", m1);
    await as(db, A, () => q(`select update_obligation_budget($1, 38000, true)`, [m1Rent.id]));
    const rows = await as(db, A, () =>
      q<{ period: string; budget_amount: string }>(
        `select to_char(period,'YYYY-MM-DD') period, budget_amount from obligations where name = 'Rent' order by period`,
      ),
    );
    expect(rows.map((r) => num(r.budget_amount))).toEqual([35000, 38000, 38000]);
    const rule = await as(db, A, () => q<{ amount: string }>(`select amount from recurring_rules where name = 'Rent'`));
    expect(num(rule[0].amount)).toBe(38000);
  });

  it("copies one-off items between months without duplicating", async () => {
    const cat = await as(db, A, () => q<{ id: string }>(`select id from categories where name = 'Rent'`));
    await as(db, A, () =>
      q(
        `insert into obligations (period, category_id, kind, name, budget_amount, due_date)
         values ($1, $2, 'expense', 'Rent deposit', 70000, $1::date + 9)`,
        [m0, cat[0].id],
      ),
    );
    const target = (await q<{ d: string }>(`select to_char($1::date + interval '3 month','YYYY-MM-DD') d`, [m0]))[0].d;
    const n1 = await as(db, A, () => q<{ n: number }>(`select copy_month_budget($1, $2) n`, [m0, target]));
    const n2 = await as(db, A, () => q<{ n: number }>(`select copy_month_budget($1, $2) n`, [m0, target]));
    expect(n1[0].n).toBeGreaterThanOrEqual(1);
    expect(n2[0].n).toBe(0);
    const copied = await as(db, A, () =>
      q(`select 1 from obligations where name = 'Rent deposit' and period = $1`, [target]),
    );
    expect(copied).toHaveLength(1);
  });
});

describe("row level security", () => {
  it("users cannot see each other's data", async () => {
    const seen = await as(db, B, () => q(`select 1 from obligations where user_id = $1`, [A]));
    expect(seen).toHaveLength(0);
    const txns = await as(db, B, () => q(`select 1 from transactions where user_id = $1`, [A]));
    expect(txns).toHaveLength(0);
  });

  it("users cannot reference another user's category", async () => {
    const aCat = await as(db, A, () => q<{ id: string }>(`select id from categories where name = 'Rent'`));
    await expect(
      as(db, B, () =>
        q(`insert into obligations (period, category_id, kind, name) values ($1, $2, 'expense', 'x')`, [
          m0,
          aCat[0].id,
        ]),
      ),
    ).rejects.toThrow();
  });

  it("users cannot pay another user's item", async () => {
    const rent = await obligation(A, "Salary", m0);
    await expect(pay(B, rent.id, 100)).rejects.toThrow(/not found/);
  });

  it("users cannot insert rows for someone else", async () => {
    await expect(
      as(db, B, () => q(`insert into payment_methods (user_id, name) values ($1, 'evil')`, [A])),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("backup & restore", () => {
  it("round-trips a backup into another account with identical balances", async () => {
    const tables = ["categories", "payment_methods", "recurring_rules", "monthly_budgets", "obligations", "transactions", "payment_allocations"];
    const backup: Record<string, unknown> = { app: "myfin", version: 1 };
    await as(db, A, async () => {
      for (const t of tables) backup[t] = await q(`select * from ${t}`);
    });
    const summary = async (u: string) =>
      as(db, u, () =>
        q<{ due: string; paid: string; out: string; tx: string }>(
          `select sum(amount_due) due, sum(paid_amount) paid, sum(outstanding) out,
                  (select sum(amount) from transactions) tx from obligation_balances`,
        ),
      );
    const before = await summary(A);
    const counts = await as(db, B, () => q<{ r: Record<string, number> }>(`select restore_backup($1::jsonb) r`, [JSON.stringify(backup)]));
    expect(counts[0].r.transactions).toBe((backup.transactions as unknown[]).length);
    const after = await summary(B);
    expect(after[0]).toEqual(before[0]);
    // reopening a restored month must not duplicate generated items
    const n1 = await as(db, B, () => q<{ n: string }>(`select count(*) n from obligations where period = $1`, [m0]));
    await as(db, B, () => q(`select ensure_month($1)`, [m0]));
    const n2 = await as(db, B, () => q<{ n: string }>(`select count(*) n from obligations where period = $1`, [m0]));
    expect(n2[0].n).toBe(n1[0].n);
  });
});
