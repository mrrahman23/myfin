// Household end-to-end test (owner + invited spouse, real Web Push delivery to a local HTTPS sink).
// Needs: npm run mock; a build/start with SUPABASE_SECRET_KEY=mock-secret, NODE_TLS_REJECT_UNAUTHORIZED=0,
// VAPID keys and CRON_SECRET (see README); key.pem/cert.pem (self-signed) next to this file.
/* eslint-disable @typescript-eslint/no-require-imports */
// Household end-to-end: owner + wife on two iPhones, against the mock Supabase.
const { chromium, devices } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const OUT = require("path").join(__dirname, "../../.e2e-shots/household");
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SB = "http://localhost:54321";

// --- fake push service (HTTPS, self-signed) that records deliveries
const pushes = [];
const push = https
  .createServer({ key: fs.readFileSync(__dirname + "/key.pem"), cert: fs.readFileSync(__dirname + "/cert.pem") }, (req, res) => {
    let n = 0;
    req.on("data", (c) => (n += c.length));
    req.on("end", () => {
      pushes.push({ path: req.url, enc: req.headers["content-encoding"], auth: (req.headers.authorization || "").slice(0, 6), urgency: req.headers.urgency, bytes: n });
      res.writeHead(201).end();
    });
  })
  .listen(9443);

async function token(email) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", body: JSON.stringify({ email, password: "x" }) });
  return (await r.json()).access_token;
}
async function rest(tok, path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(path + " " + t);
  return t ? JSON.parse(t) : null;
}
function fakeSubscription(path) {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { platform: "web", endpoint: `https://localhost:9443/${path}`, p256dh: ecdh.getPublicKey().toString("base64url"), auth_secret: crypto.randomBytes(16).toString("base64url") };
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (name) => {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${name} pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/websocket|realtime|WebSocket/i.test(m.text()) && errors.push(`${name} console: ${m.text().slice(0, 200)}`));
    return { ctx, page };
  };
  const step = async (name, fn) => {
    try {
      await fn();
      console.log("✓", name);
    } catch (e) {
      console.log("✗", name, e.message.split("\n")[0]);
    }
  };
  const { page: owner } = await mk("owner");
  const { page: wife } = await mk("wife");
  const shotO = (n) => owner.screenshot({ path: `${OUT}/${n}.png` });
  const shotW = (n) => wife.screenshot({ path: `${OUT}/${n}.png` });

  await step("owner signs up", async () => {
    await owner.goto("/login");
    await owner.getByRole("tab", { name: "Create account" }).click();
    await owner.getByLabel("Your name").fill("Rejaur Rahman");
    await owner.getByLabel("Email").fill("owner@example.com");
    await owner.getByLabel("Password").fill("password123");
    await owner.getByRole("button", { name: "Create account" }).click();
    await owner.getByText("Available balance").waitFor();
  });
  await step("set a due date from the item sheet", async () => {
    await owner.getByRole("link", { name: "Budget", exact: true }).click();
    await owner.getByText("Rent", { exact: true }).click();
    const d = owner.getByRole("dialog");
    await d.getByLabel("Due date").fill("2026-11-28");
    await owner.getByText(/Due 28 Nov — you'll be reminded/).waitFor();
    await shotO("01-due-date");
    await d.getByRole("button", { name: "Close" }).click();
  });
  await step("owner creates household", async () => {
    await owner.getByRole("link", { name: "Household", exact: true }).click();
    await owner.getByText("Shared shopping list").waitFor();
    await shotO("02-setup");
    await owner.getByLabel("Household name").fill("Rahman Home");
    await owner.getByRole("button", { name: "Create household" }).click();
    await owner.getByText("The list is empty").waitFor();
  });
  await step("owner adds wife from settings", async () => {
    await owner.goto("/settings/household");
    await owner.getByRole("button", { name: "Add family member" }).click();
    await owner.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Sadia");
    await owner.getByLabel("Their email").fill("sadia@example.com");
    await owner.getByLabel("Password for their account").fill("sadia-pass-1");
    await owner.getByRole("button", { name: "Add to household" }).click();
    await owner.getByText("Sadia is now in your household.").waitFor();
    await shotO("03-invited");
    await owner.getByRole("button", { name: "Done" }).click();
    await owner.getByText("Sadia", { exact: true }).waitFor();
  });
  await step("register fake push devices for both", async () => {
    const o = await token("owner@example.com");
    const w = await token("sadia@example.com");
    await rest(o, "push_subscriptions", { method: "POST", body: JSON.stringify(fakeSubscription("owner")) });
    await rest(w, "push_subscriptions", { method: "POST", body: JSON.stringify(fakeSubscription("wife")) });
  });
  await step("wife signs in → household only", async () => {
    await wife.goto("/login");
    await wife.getByLabel("Email").fill("sadia@example.com");
    await wife.getByLabel("Password").fill("sadia-pass-1");
    await wife.getByRole("button", { name: "Sign in" }).click();
    await wife.waitForURL(/\/household/);
    await wife.getByText("চাল", { exact: true }).waitFor(); // opens on the catalogue
    const tabs = await wife.locator("nav[aria-label=Main] a:visible").allInnerTexts();
    if (tabs.join(",") !== "Household,Settings") throw new Error("tabs: " + tabs.join(","));
    await shotW("04-wife-home");
  });
  await step("wife adds Rice (urgent) → owner gets a push", async () => {
    pushes.length = 0;
    await wife.getByRole("button", { name: /^Rice, চাল\. Tap to add/ }).click();
    await wife.getByText(/^চাল · 5 kg added$/).waitFor();
    // tap again to mark it urgent with a note
    await wife.getByRole("button", { name: /^Rice, চাল\. On the list/ }).click();
    await wife.getByRole("switch", { name: "Urgent" }).click();
    await wife.getByLabel("Note").fill("Miniket");
    await shotW("05-wife-add");
    await wife.getByRole("button", { name: "Save" }).click();
    await wife.getByText("Updated").waitFor();
    await wife.getByText("Sadia").waitFor({ state: "detached" }).catch(() => {});
    for (let i = 0; i < 20 && !pushes.length; i++) await wife.waitForTimeout(250);
    if (!pushes.find((p) => p.path === "/owner")) throw new Error("no push to owner: " + JSON.stringify(pushes));
    if (pushes.find((p) => p.path === "/wife")) throw new Error("wife should not be notified of her own add");
    console.log("   push:", JSON.stringify(pushes[0]));
    await shotW("06-wife-list");
  });
  await step("owner sees request and marks bought with price → expense", async () => {
    await owner.goto("/household");
    await owner.getByRole("button", { name: "Mark Rice as bought" }).waitFor();
    await owner.getByText(/Sadia · /).waitFor();
    await owner.getByText("Urgent").waitFor();
    await shotO("07-owner-list");
    pushes.length = 0;
    await owner.getByRole("button", { name: "Mark Rice as bought" }).click();
    const d = owner.getByRole("dialog");
    await d.getByLabel("Total price").fill("450");
    await d.getByLabel("Shop (optional)").fill("Shwapno");
    await d.getByText("৳90 per kg").waitFor();
    await shotO("08-purchase");
    await d.getByRole("button", { name: /Bought 5 kg/ }).click();
    await owner.getByText(/Rice bought · ৳450/).waitFor();
    for (let i = 0; i < 20 && !pushes.length; i++) await owner.waitForTimeout(250);
    if (!pushes.find((p) => p.path === "/wife")) throw new Error("no 'bought' push to wife");
    await owner.getByText("The list is empty").waitFor();
  });
  await step("purchase shows in owner's Transactions as Groceries", async () => {
    await owner.goto("/transactions");
    await owner.getByText("Rice · 5 kg").waitFor();
    await owner.getByText(/Groceries/).first().waitFor();
    await shotO("09-transactions");
  });
  await step("wife cannot see owner's finance", async () => {
    await wife.goto("/transactions");
    await wife.getByText("No transactions in this period").waitFor();
  });
  await step("history → predictions & suggestions", async () => {
    const o = await token("owner@example.com");
    const hh = (await rest(o, "household_members?select=household_id"))[0].household_id;
    const today = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
    const day = (n) => new Date(new Date(today).getTime() + n * 86400e3).toISOString().slice(0, 10);
    const itemId = async (name) => (await rest(o, `household_items?select=id&name=eq.${encodeURIComponent(name)}`))[0].id;
    const oil = await itemId("Soybean Oil");
    const eggs = await itemId("Eggs");
    const buys = [
      [oil, day(-30), 2, 360], [oil, day(-16), 2, 380], [oil, day(-2), 2, 400],
      [eggs, day(-13), 1, 150], [eggs, day(-6), 1, 155],
    ];
    for (const [item_id, purchased_on, qty, price] of buys) {
      await rest(o, "household_purchases", { method: "POST", body: JSON.stringify({ household_id: hh, item_id, purchased_on, qty, total_price: price, store: "Agora" }) });
    }
    await owner.goto("/household");
    await owner.getByText("Running low soon").waitFor();
    await owner.getByText(/^Eggs/).first().waitFor();
    await shotO("10-suggestions");
    await owner.getByRole("tab", { name: "Pantry" }).click();
    await owner.getByText(/^Soybean Oil/).first().waitFor();
    await shotO("11-pantry");
    await owner.getByText(/^Soybean Oil/).first().click();
    await owner.getByRole("dialog").getByText(/2 L lasts 2 weeks|2 L lasts about 2 weeks|2 L lasts 14 days/).waitFor();
    await owner.screenshot({ path: `${OUT}/12-item-detail.png`, fullPage: false });
    await owner.getByRole("button", { name: "Close" }).click();
    await owner.getByRole("tab", { name: "Insights" }).click();
    await owner.getByText("Price increases").waitFor();
    await owner.screenshot({ path: `${OUT}/13-insights.png`, fullPage: true });
  });
  await step("daily cron sends reminders + run-out alerts", async () => {
    pushes.length = 0;
    const bad = await fetch(`${BASE}/api/cron/daily`);
    if (bad.status !== 401) throw new Error("cron without secret should be 401, got " + bad.status);
    const r = await fetch(`${BASE}/api/cron/daily`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const j = await r.json();
    console.log("   cron:", JSON.stringify(j), "pushes:", pushes.map((p) => p.path).join(","));
    if (!r.ok || j.errors?.length) throw new Error(JSON.stringify(j));
    if (!(j.household >= 2)) throw new Error("expected household alerts to both members");
  });
  await step("notify endpoint rejects outsiders", async () => {
    const r = await fetch(`${BASE}/api/household/notify`, { method: "POST", body: JSON.stringify({ type: "request", id: crypto.randomUUID() }) });
    if (r.status !== 401) throw new Error("expected 401, got " + r.status);
  });
  await step("owner desktop household view", async () => {
    const d = await browser.newContext({ viewport: { width: 1440, height: 950 }, baseURL: BASE, storageState: await owner.context().storageState() });
    const p = await d.newPage();
    await p.goto("/household");
    await p.getByText("Running low soon").waitFor();
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/14-desktop.png` });
  });

  console.log("\nErrors:", errors.length ? "\n" + [...new Set(errors)].join("\n") : "none");
  push.close();
  await browser.close();
})();
