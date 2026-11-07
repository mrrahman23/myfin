import { beforeAll, describe, expect, it } from "vitest";
import { as, asService, createTestDb, createUser, num, type TestDb } from "./harness";

const OWNER = "aaaaaaaa-1111-4111-8111-111111111111";
const WIFE = "bbbbbbbb-2222-4222-8222-222222222222";
const STRANGER = "cccccccc-3333-4333-8333-333333333333";

let db: TestDb;
let hid: string;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, OWNER, "Rejaur");
  await createUser(db, WIFE, "Sadia", { household_only: true });
  await createUser(db, STRANGER, "Stranger");
}, 60_000);

describe("accounts", () => {
  it("household-only accounts get no finance data", async () => {
    const r = await as(db, WIFE, () =>
      q<{ cats: string; finance: boolean }>(
        `select (select count(*) from categories) cats, (select finance_enabled from user_settings) finance`,
      ),
    );
    expect(num(r[0].cats)).toBe(0);
    expect(r[0].finance).toBe(false);
  });
});

describe("household membership", () => {
  it("owner creates a household and the server adds a member", async () => {
    hid = (await as(db, OWNER, () => q<{ id: string }>(`select create_household('Rahman Home', 'Rejaur') id`)))[0].id;
    await expect(as(db, OWNER, () => q(`select create_household('Second', 'x')`))).rejects.toThrow(/already in a household/);
    const uid = (await asService(db, () => q<{ id: string }>(`select find_user_id_by_email($1) id`, [`${WIFE.slice(0, 8)}@example.com`])))[0].id;
    expect(uid).toBe(WIFE);
    await asService(db, () => q(`select household_add_member($1, $2, 'Sadia')`, [hid, WIFE]));
    const members = await as(db, WIFE, () => q<{ display_name: string; role: string }>(`select display_name, role from household_members order by role`));
    expect(members.map((m) => [m.display_name, m.role])).toEqual([
      ["Rejaur", "owner"],
      ["Sadia", "member"],
    ]);
  });

  it("clients cannot add members or call server-only functions", async () => {
    await expect(
      as(db, STRANGER, () => q(`insert into household_members (household_id, user_id, display_name) values ($1, $2, 'x')`, [hid, STRANGER])),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, STRANGER, () => q(`select household_add_member($1, $2, 'x')`, [hid, STRANGER]))).rejects.toThrow(/permission denied/);
    await expect(as(db, STRANGER, () => q(`select find_user_id_by_email('a@b.c')`))).rejects.toThrow(/permission denied/);
    await expect(as(db, STRANGER, () => q(`select ensure_month_for($1, current_date)`, [OWNER]))).rejects.toThrow(/permission denied/);
  });
});

describe("shopping list", () => {
  it("wife adds an item; re-adding updates the same open request", async () => {
    const r1 = (await as(db, WIFE, () => q<{ id: string }>(`select request_household_item(null, 'Rice', 'kg', 'Grains', 5, 'normal', null) id`)))[0].id;
    const r2 = (await as(db, WIFE, () => q<{ id: string }>(`select request_household_item(null, ' rice ', null, null, null, 'urgent', 'Miniket') id`)))[0].id;
    expect(r2).toBe(r1);
    const rows = await as(db, OWNER, () =>
      q<{ name: string; unit: string; qty: string; urgency: string; note: string }>(
        `select i.name, i.unit, r.qty, r.urgency, r.note from shopping_requests r join household_items i on i.id = r.item_id where r.status = 'open'`,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Rice", unit: "kg", urgency: "urgent", note: "Miniket" });
    expect(num(rows[0].qty)).toBe(5);
  });

  it("outsiders see nothing and cannot write", async () => {
    expect(await as(db, STRANGER, () => q(`select * from shopping_requests`))).toHaveLength(0);
    expect(await as(db, STRANGER, () => q(`select * from household_items`))).toHaveLength(0);
    await expect(as(db, STRANGER, () => q(`select request_household_item(null, 'Oil')`))).rejects.toThrow(/household first/);
    await expect(
      as(db, STRANGER, () => q(`insert into household_items (household_id, name) values ($1, 'x')`, [hid])),
    ).rejects.toThrow(/row-level security/);
  });

  it("finance stays private between household members", async () => {
    expect(await as(db, WIFE, () => q(`select * from categories where user_id = $1`, [OWNER]))).toHaveLength(0);
    expect(await as(db, WIFE, () => q(`select * from transactions where user_id = $1`, [OWNER]))).toHaveLength(0);
  });
});

describe("purchases", () => {
  it("recording a purchase closes the request and adds a Groceries expense", async () => {
    const item = (await as(db, OWNER, () => q<{ id: string }>(`select id from household_items where name = 'Rice'`)))[0].id;
    const ref = "dddddddd-4444-4444-8444-444444444444";
    const p1 = (await as(db, OWNER, () =>
      q<{ id: string }>(`select record_household_purchase($1, 5, 450, current_date, 'Shwapno', true, null, null, $2) id`, [item, ref]),
    ))[0].id;
    const p2 = (await as(db, OWNER, () =>
      q<{ id: string }>(`select record_household_purchase($1, 5, 450, current_date, 'Shwapno', true, null, null, $2) id`, [item, ref]),
    ))[0].id;
    expect(p2).toBe(p1); // idempotent

    const req = await as(db, WIFE, () => q<{ status: string; purchase_id: string }>(`select status, purchase_id from shopping_requests`));
    expect(req[0]).toMatchObject({ status: "bought", purchase_id: p1 });

    const fin = await as(db, OWNER, () =>
      q<{ amount: string; name: string; carry_forward: boolean }>(
        `select t.amount, c.name, c.carry_forward from transactions t join categories c on c.id = t.category_id where t.notes = 'Household purchase'`,
      ),
    );
    expect(fin).toHaveLength(1);
    expect(fin[0]).toMatchObject({ name: "Groceries", carry_forward: false });
    expect(num(fin[0].amount)).toBe(450);

    // the wife sees the purchase but not the owner's transaction
    const seen = await as(db, WIFE, () => q<{ qty: string; transaction_id: string }>(`select qty, transaction_id from household_purchases`));
    expect(num(seen[0].qty)).toBe(5);
    expect(await as(db, WIFE, () => q(`select * from transactions where id = $1`, [seen[0].transaction_id]))).toHaveLength(0);
  });

  it("a purchase cannot be linked to someone else's transaction", async () => {
    const t = (await as(db, OWNER, () => q<{ id: string }>(`select id from transactions limit 1`)))[0].id;
    const item = (await as(db, WIFE, () => q<{ id: string }>(`select id from household_items limit 1`)))[0].id;
    await expect(
      as(db, WIFE, () =>
        q(`insert into household_purchases (household_id, item_id, qty, purchased_on, transaction_id) values ($1, $2, 1, current_date, $3)`, [hid, item, t]),
      ),
    ).rejects.toThrow(/Linked transaction not found/);
  });

  it("the wife can record a purchase without touching finance", async () => {
    const id = (await as(db, WIFE, () => q<{ id: string }>(`select request_household_item(null, 'Soybean Oil', 'L', null, 2) id`)))[0].id;
    const item = (await as(db, WIFE, () => q<{ item_id: string }>(`select item_id from shopping_requests where id = $1`, [id])))[0].item_id;
    await as(db, WIFE, () => q(`select record_household_purchase($1, 2, 380, null, null, false)`, [item]));
    const tx = await as(db, WIFE, () => q(`select * from transactions`));
    expect(tx).toHaveLength(0);
  });
});

describe("server-side month opening", () => {
  it("ensure_month_for generates a user's items for the cron job", async () => {
    await asService(db, () => q(`select ensure_month_for($1, date_trunc('month', user_today($1))::date)`, [OWNER]));
    const n = await as(db, OWNER, () => q<{ n: string }>(`select count(*) n from obligations`));
    expect(num(n[0].n)).toBe(20);
    // the client-facing wrapper still works and stays idempotent
    await as(db, OWNER, () => q(`select ensure_month(date_trunc('month', user_today($1))::date)`, [OWNER]));
    const n2 = await as(db, OWNER, () => q<{ n: string }>(`select count(*) n from obligations`));
    expect(num(n2[0].n)).toBe(20);
  });
});
