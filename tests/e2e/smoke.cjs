// End-to-end smoke test (iPhone 13 + desktop) against the mock Supabase server.
// Run:   npm run mock   &   npm run dev:mock   &
//        npm i --no-save playwright && npx playwright install chromium
//        BASE_URL=http://localhost:3000 node tests/e2e/smoke.cjs
/* eslint-disable @typescript-eslint/no-require-imports */

const { chromium, devices } = require("playwright");
const OUT = require("path").join(__dirname, "../../.e2e-shots");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  const step = async (name, fn) => {
    try {
      await fn();
      console.log("✓", name);
    } catch (e) {
      console.log("✗", name, e.message.split("\n")[0]);
      await shot("fail-" + name.replace(/\W+/g, "-"));
    }
  };

  await step("login redirect", async () => {
    await page.goto("/");
    await page.waitForURL(/\/login/);
    await shot("01-login");
  });
  await step("sign up & land on overview", async () => {
    await page.getByRole("tab", { name: "Create account" }).click();
    await page.getByLabel("Your name").fill("Rejaur Rahman");
    await page.getByLabel("Email").fill("rejaur@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(BASE + "/");
    await page.getByText("Available balance").waitFor();
    await page.getByText("Total monthly income").waitFor();
    await page.waitForTimeout(1500);
    await shot("02-overview");
    await page.screenshot({ path: `${OUT}/02b-overview-full.png`, fullPage: true });
  });
  await step("budget list shows seeded items", async () => {
    await page.getByRole("link", { name: "Budget", exact: true }).click();
    await page.getByText("Rent", { exact: true }).waitFor();
    await page.waitForTimeout(500);
    await shot("03-budget");
  });
  await step("tick Rent paid", async () => {
    await page.getByRole("checkbox", { name: /^Rent:/ }).click();
    await page.getByText(/Rent paid · ৳35,000/).waitFor();
    await shot("04-rent-paid-toast");
  });
  await step("undo via toast", async () => {
    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForTimeout(1200);
    const state = await page.getByRole("checkbox", { name: /^Rent:/ }).getAttribute("aria-checked");
    if (state !== "false") throw new Error("Rent still " + state);
    await page.getByRole("checkbox", { name: /^Rent:/ }).click();
    await page.waitForTimeout(1200);
  });
  await step("partial payment on Personal Loan", async () => {
    await page.getByText("Personal Loan", { exact: true }).click();
    await page.getByRole("dialog").getByText("Due now").waitFor();
    await shot("05-item-sheet");
    await page.getByRole("button", { name: "Partial payment" }).click();
    await page.getByLabel("Amount").fill("30000");
    await shot("06-partial-form");
    await page.getByRole("button", { name: "Record" }).click();
    await page.getByRole("dialog").getByText("Partially Paid").waitFor();
    await page.waitForTimeout(600);
    await shot("07-after-partial");
    await page.getByRole("button", { name: "Close" }).click();
  });
  await step("electricity: actual 6,000 → pay 4,000", async () => {
    await page.getByText("Electricity Bill", { exact: true }).click();
    await page.getByRole("button", { name: "Partial payment" }).click();
    await page.getByLabel("Amount").fill("4000");
    await page.getByRole("button", { name: "Record" }).click();
    await page.getByRole("dialog").getByText("Partially Paid").waitFor();
    await page.getByRole("button", { name: "Close" }).click();
  });
  await step("next month: carried 2,000 + actual 6,500", async () => {
    await page.getByRole("button", { name: "Next month" }).click();
    await page.getByText("Electricity Bill", { exact: true }).waitFor();
    await page.waitForTimeout(800);
    await page.getByText("Electricity Bill", { exact: true }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByText("Carried from earlier months").waitFor();
    await dlg.getByLabel("Actual amount").fill("6500");
    await dlg.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(1200);
    await shot("08-dec-electricity");
    const due = await dlg.locator("text=Due now").locator("xpath=..").innerText();
    if (!due.includes("8,500")) throw new Error("expected ৳8,500 due, got " + due);
    await dlg.getByRole("button", { name: "Partial payment" }).click();
    await page.getByLabel("Amount").fill("5000");
    await page.getByRole("button", { name: "Record" }).click();
    await page.waitForTimeout(1200);
    const due2 = await dlg.locator("text=Due now").locator("xpath=..").innerText();
    if (!due2.includes("3,500")) throw new Error("expected ৳3,500 remaining, got " + due2);
    await shot("09-dec-after-5000");
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Previous month" }).click();
    await page.waitForTimeout(800);
  });
  await step("quick add expense", async () => {
    await page.getByRole("button", { name: "Quick add" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Add expense/ }).click();
    await page.getByLabel("Amount").fill("1250");
    await page.getByLabel("Description").fill("Groceries");
    await shot("10-quick-add");
    await page.getByRole("button", { name: "Add transaction" }).click();
    await page.getByText("Transaction added").waitFor();
  });
  await step("income received", async () => {
    await page.getByRole("tab", { name: /^Income/ }).click();
    await page.getByRole("checkbox", { name: /^Salary:/ }).click();
    await page.getByText(/Salary received/).waitFor();
    await page.waitForTimeout(800);
    await shot("11-income");
  });
  await step("overview figures", async () => {
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await page.waitForTimeout(2000);
    await shot("12-overview-after");
    await page.screenshot({ path: `${OUT}/12b-overview-after-full.png`, fullPage: true });
  });
  await step("transactions ledger", async () => {
    await page.getByRole("link", { name: "Transactions", exact: true }).click();
    await page.getByText("Groceries").waitFor();
    await page.waitForTimeout(500);
    await shot("13-transactions");
    await page.getByLabel("Search transactions").fill("groc");
    await page.getByText("1 transaction", { exact: true }).waitFor();
  });
  await step("analytics", async () => {
    await page.goto("/analytics");
    await page.getByText("Income vs expenses by month").waitFor();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/14-analytics-full.png`, fullPage: true });
  });
  await step("settings + dark mode", async () => {
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByText("Budget setup").waitFor();
    await shot("15-settings");
    await page.getByRole("link", { name: /Appearance/ }).click();
    await page.getByRole("tab", { name: "Dark" }).click();
    await page.waitForTimeout(800);
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await page.waitForTimeout(1500);
    await shot("16-overview-dark");
    await page.getByRole("link", { name: "Budget", exact: true }).click();
    await page.waitForTimeout(1200);
    await shot("17-budget-dark");
  });
  await step("recurring + categories pages", async () => {
    await page.goto("/settings/recurring");
    await page.getByText("Auto Loan").waitFor();
    await shot("18-recurring");
    await page.goto("/settings/categories");
    await page.getByText("Credit Cards").waitFor();
    await shot("19-categories");
  });
  await step("desktop layout", async () => {
    const d = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL: BASE, storageState: await ctx.storageState() });
    const p = await d.newPage();
    p.on("pageerror", (e) => errors.push("pageerror(desktop): " + e.message));
    await p.goto("/");
    await p.getByText("Available balance").waitFor();
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/20-desktop-overview.png`, fullPage: true });
    await p.goto("/budget");
    await p.getByText("Rent", { exact: true }).waitFor();
    await p.waitForTimeout(1000);
    await p.screenshot({ path: `${OUT}/21-desktop-budget.png` });
    await p.goto("/analytics");
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/22-desktop-analytics.png`, fullPage: true });
  });

  console.log("\nErrors:", errors.length ? "\n" + [...new Set(errors)].join("\n") : "none");
  await browser.close();
})();
