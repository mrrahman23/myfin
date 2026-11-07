// Catalogue end-to-end test: bilingual tap-to-add, photo upload, buying from the list.
// Same setup as household.cjs (mock Supabase + start with SUPABASE_SECRET_KEY=mock-secret,
// NODE_TLS_REJECT_UNAUTHORIZED=0, VAPID keys) and key.pem/cert.pem next to this file.
/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium, devices } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");
const OUT = path.join(__dirname, "../../.e2e-shots/catalog");
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SB = "http://localhost:54321";
const PHOTO = path.join(__dirname, "../../public/icons/icon-512.png");

const pushes = [];
const sink = https
  .createServer({ key: fs.readFileSync(__dirname + "/key.pem"), cert: fs.readFileSync(__dirname + "/cert.pem") }, (req, res) => {
    pushes.push(req.url);
    req.resume();
    req.on("end", () => res.writeHead(201).end());
  })
  .listen(9443);

async function token(email) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", body: JSON.stringify({ email, password: "x" }) });
  return (await r.json()).access_token;
}
function fakeSub(p) {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { platform: "web", endpoint: `https://localhost:9443/${p}`, p256dh: ecdh.getPublicKey().toString("base64url"), auth_secret: crypto.randomBytes(16).toString("base64url") };
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (name, device = "iPhone 13") => {
    const ctx = await browser.newContext({ ...devices[device], baseURL: BASE });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${name} pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/websocket|realtime/i.test(m.text()) && errors.push(`${name} console: ${m.text().slice(0, 200)}`));
    return page;
  };
  const step = async (name, fn) => {
    try {
      await fn();
      console.log("✓", name);
    } catch (e) {
      console.log("✗", name, e.message.split("\n")[0]);
    }
  };
  const owner = await mk("owner");
  const wife = await mk("wife");
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

  await step("owner creates household → catalogue is pre-filled", async () => {
    await owner.goto("/login");
    await owner.getByRole("tab", { name: "Create account" }).click();
    await owner.getByLabel("Your name").fill("Rejaur Rahman");
    await owner.getByLabel("Email").fill("cat-owner@example.com");
    await owner.getByLabel("Password").fill("password123");
    await owner.getByRole("button", { name: "Create account" }).click();
    await owner.getByText("Available balance").waitFor();
    await owner.goto("/household");
    await owner.getByLabel("Household name").fill("Rahman Home");
    await owner.getByRole("button", { name: "Create household" }).click();
    await owner.getByRole("tab", { name: "Add items" }).click();
    await owner.getByText("চাল", { exact: true }).waitFor();
    await owner.getByText("ডায়াপার", { exact: true }).waitFor();
  });
  await step("owner adds Sadia", async () => {
    await owner.goto("/settings/household");
    await owner.getByRole("button", { name: "Add family member" }).click();
    const d = owner.getByRole("dialog");
    await d.getByLabel("Name", { exact: true }).fill("Sadia");
    await d.getByLabel("Their email").fill("cat-sadia@example.com");
    await d.getByLabel("Password for their account").fill("sadia-pass-1");
    await d.getByRole("button", { name: "Add to household" }).click();
    await owner.getByText("Sadia is now in your household.").waitFor();
    const o = await token("cat-owner@example.com");
    await fetch(`${SB}/rest/v1/push_subscriptions`, { method: "POST", headers: { Authorization: `Bearer ${o}`, "content-type": "application/json" }, body: JSON.stringify(fakeSub("owner")) });
  });
  await step("Sadia opens straight into the catalogue", async () => {
    await wife.goto("/login");
    await wife.getByLabel("Email").fill("cat-sadia@example.com");
    await wife.getByLabel("Password").fill("sadia-pass-1");
    await wife.getByRole("button", { name: "Sign in" }).click();
    await wife.waitForURL(/\/household/);
    await wife.getByText("চাল", { exact: true }).waitFor();
    await wife.waitForTimeout(500);
    await shot(wife, "01-catalog");
  });
  await step("one tap adds চাল, পেঁয়াজ and ডায়াপার (with usual qty) and notifies Rejaur", async () => {
    pushes.length = 0;
    for (const bn of ["চাল", "পেঁয়াজ", "ডায়াপার"]) {
      await wife.getByRole("button", { name: new RegExp(`, ${bn}\\. Tap to add`) }).click();
      await wife.getByText(new RegExp(`^${bn} · .* added$`)).waitFor();
    }
    await wife.getByText("5 kg").first().waitFor();
    await shot(wife, "02-tapped");
    for (let i = 0; i < 20 && pushes.length < 3; i++) await wife.waitForTimeout(250);
    if (pushes.filter((p) => p === "/owner").length < 3) throw new Error("expected 3 pushes, got " + pushes.join(","));
  });
  await step("undo removes an accidental tap", async () => {
    await wife.getByRole("button", { name: /, লেবু\. Tap to add/ }).click();
    await wife.getByText(/^লেবু · .* added$/).waitFor();
    await wife.getByRole("button", { name: "Undo" }).click();
    await wife.getByRole("button", { name: /, লেবু\. Tap to add/ }).waitFor();
  });
  await step("search in Bangla", async () => {
    await wife.getByLabel("Search items").fill("ডাল");
    await wife.getByText("মসুর ডাল", { exact: true }).waitFor();
    await wife.getByText("মুগ ডাল", { exact: true }).waitFor();
    await shot(wife, "03-search");
    await wife.getByLabel("Search items").fill("");
  });
  await step("Sadia adds a photo of her toothpaste brand", async () => {
    await wife.getByRole("button", { name: "Edit Toothpaste", exact: true }).click();
    const d = wife.getByRole("dialog");
    await d.getByLabel("Photo").setInputFiles(PHOTO);
    await d.getByRole("button", { name: "Save" }).click();
    await wife.getByText("Item saved").waitFor();
    await wife.locator('button[aria-label^="Toothpaste, টুথপেস্ট"] img').waitFor();
    await wife.getByRole("button", { name: /^Toothpaste, টুথপেস্ট/ }).scrollIntoViewIfNeeded();
    await shot(wife, "04-photo");
  });
  await step("Sadia creates a new item in Bangla", async () => {
    await wife.getByRole("button", { name: "New catalogue item" }).click();
    const d = wife.getByRole("dialog");
    await d.getByLabel("Name (English)").fill("Mosquito Coil");
    await d.getByLabel("নাম (বাংলা)").fill("মশার কয়েল");
    await d.getByLabel("Usual qty").fill("1");
    await d.getByRole("button", { name: "Add to catalogue" }).click();
    await wife.getByText("মশার কয়েল", { exact: true }).waitFor();
  });
  await step("Rejaur sees the list with pictures and buys rice in two taps", async () => {
    await owner.goto("/household");
    await owner.getByRole("tab", { name: /^List/ }).click();
    await owner.getByText("ডায়াপার").waitFor();
    await shot(owner, "05-owner-list");
    await owner.getByRole("button", { name: "Mark Rice as bought" }).click();
    const d = owner.getByRole("dialog");
    await d.getByLabel("Total price").fill("425");
    await shot(owner, "06-buy");
    await d.getByRole("button", { name: /Bought 5 kg/ }).click();
    await owner.getByText(/Rice bought · ৳425/).waitFor();
    await owner.getByRole("button", { name: "Mark Rice as bought" }).waitFor({ state: "detached" });
  });
  await step("Android (Pixel 7) catalogue", async () => {
    const a = await mk("android", "Pixel 7");
    await a.goto("/login");
    await a.getByLabel("Email").fill("cat-sadia@example.com");
    await a.getByLabel("Password").fill("x");
    await a.getByRole("button", { name: "Sign in" }).click();
    await a.waitForURL(/\/household/);
    await a.getByText("চাল", { exact: true }).waitFor();
    await a.waitForTimeout(600);
    await shot(a, "07-android-catalog");
  });

  console.log("\nErrors:", errors.length ? "\n" + [...new Set(errors)].join("\n") : "none");
  sink.close();
  await browser.close();
})();
