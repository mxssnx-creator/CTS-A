#!/usr/bin/env node
import { chromium } from "playwright";

const BASE = process.env.DESK_URL || "http://127.0.0.1:8080";
const PAGES = [
  "/",
  "/strategies",
  "/positions",
  "/orders",
  "/engine",
  "/combinations",
  "/lanes",
  "/replay",
  "/tactics",
  "/performance",
  "/results",
  "/statistics",
  "/heatmap",
  "/system",
  "/settings",
  "/connections",
];

const issues = [];
function note(page, kind, msg) {
  const s = String(msg || "").slice(0, 240);
  if (/favicon|Download the React DevTools|css-.*\.css/i.test(s)) return;
  issues.push({ page, kind, msg: s });
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => note(page.url(), "pageerror", e.message));
page.on("console", (m) => {
  if (m.type() === "error") note(page.url(), "console", m.text());
});

const report = [];

async function visit(path) {
  const url = BASE + path;
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(900);
  const status = res?.status() ?? 0;
  const title = await page.locator("h1, h2").first().textContent().catch(() => "");
  const body = (await page.locator("main, body").first().innerText().catch(() => "")).slice(0, 400);
  const crashed = /something went wrong|application error|undefined is not|cannot read/i.test(body);
  const empty = body.trim().length < 40;
  report.push({ path, status, title: (title || "").trim().slice(0, 80), crashed, empty, len: body.length });
  if (status !== 200) issues.push({ page: path, kind: "http", msg: String(status) });
  if (crashed) issues.push({ page: path, kind: "crash", msg: body.slice(0, 180) });
  if (empty) issues.push({ page: path, kind: "empty", msg: "blank main" });
}

for (const p of PAGES) await visit(p);

// nav links from overview
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25000 });
await page.waitForTimeout(600);
const navHrefs = await page.$$eval("nav a", (as) => as.map((a) => a.getAttribute("href")).filter(Boolean));
report.push({ path: "nav", hrefs: navHrefs });
for (const href of navHrefs) {
  if (!href || href === "#" || href.startsWith("http")) continue;
  const loc = page.locator(`nav a[href="${href}"]`).first();
  if (await loc.count()) {
    await loc.click({ timeout: 8000 }).catch((e) => note(href, "nav-click", e.message));
    await page.waitForTimeout(500);
    const u = new URL(page.url()).pathname;
    if (u !== href && u.replace(/\/$/, "") !== href.replace(/\/$/, "")) {
      issues.push({ page: href, kind: "nav", msg: `landed ${u}` });
    }
  }
}

// Overview processing: start/pause if present
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(700);
for (const label of ["Start", "Pause", "Reset"]) {
  const btn = page.getByRole("button", { name: new RegExp(label, "i") }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 5000 }).catch((e) => note("/", "click", `${label} ${e.message}`));
    await page.waitForTimeout(400);
  }
}

// Replay run
await page.goto(BASE + "/replay", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
for (const name of [/Run 8h/i, /Run sim/i, /Simulate/i, /Play/i, /Complete/i]) {
  const btn = page.getByRole("button", { name }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 5000 }).catch((e) => note("/replay", "click", `${name} ${e.message}`));
    await page.waitForTimeout(600);
  }
}

// Results
await page.goto(BASE + "/results", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
for (const name of [/Run all/i, /Complete/i, /Refresh/i]) {
  const btn = page.getByRole("button", { name }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 5000 }).catch((e) => note("/results", "click", `${name} ${e.message}`));
    await page.waitForTimeout(600);
  }
}

// Settings segmented
await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
const exec = page.locator("#execution");
if (await exec.count()) {
  const txt = await exec.innerText();
  if (!/Hedge|Cross|Leverage|Min size/i.test(txt)) {
    issues.push({ page: "/settings", kind: "missing", msg: "execution live-exec controls missing" });
  }
}
for (const name of [/Hedge L\+S/i, /Cross/i, /Max/]) {
  const btn = page.getByRole("button", { name }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 4000 }).catch((e) => note("/settings", "click", `${name} ${e.message}`));
    await page.waitForTimeout(200);
  }
}

// Connections ping
await page.goto(BASE + "/connections", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
const ping = page.getByRole("button", { name: /Ping/i }).first();
if (await ping.count()) {
  await ping.click({ timeout: 5000 }).catch((e) => note("/connections", "click", e.message));
  await page.waitForTimeout(800);
}

// Positions send
await page.goto(BASE + "/positions", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(700);
const send = page.getByRole("button", { name: /Send|Place|Submit/i }).first();
if (await send.count()) {
  // don't actually place; just ensure enabled state readable
  const disabled = await send.isDisabled();
  report.push({ path: "/positions send", disabled });
}

await browser.close();
console.log(JSON.stringify({ base: BASE, report, issues }, null, 2));
if (issues.some((i) => i.kind === "pageerror" || i.kind === "crash" || i.kind === "http")) process.exit(2);
