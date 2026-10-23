/* Isolated presentation harness. Only SELECTs inside PostgreSQL READ ONLY transactions.
   Every browser write request is blocked; the actual app/API/auth are not started or changed. */
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const { PrismaClient } = require("@prisma/client");
const { periodRange, today, attendanceHours } = require("../../lib/time.ts");
const db = new PrismaClient();
const root = process.cwd(),
  output = path.join(root, ".local/ui-modern-business");
let server,
  browser,
  origin,
  writes = 0,
  props;
async function readOnly(fn) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return fn(tx);
  });
}
async function snapshot(venueId, date, period) {
  return readOnly(async (tx) => {
    const r = periodRange(date, period),
      month = periodRange(date, "month");
    const filter = {
      venueId,
      businessDate: { gte: new Date(r.start), lte: new Date(r.end) },
    };
    const [
      employees,
      shifts,
      attendances,
      sales,
      goal,
      monthly,
      imports,
      absences,
      audit,
    ] = await Promise.all([
      tx.employeeVenue.findMany({
        where: { venueId },
        include: { employee: true },
      }),
      tx.shift.findMany({
        where: { venueId, startsAt: { gte: r.startAt, lt: r.endAt } },
        include: { assignment: { include: { employee: true } } },
      }),
      tx.attendance.findMany({
        where: { venueId, startsAt: { gte: r.startAt, lt: r.endAt } },
        include: { pauses: true, assignment: { include: { employee: true } } },
      }),
      tx.sale.findMany({ where: filter, include: { items: true } }),
      tx.goal.findUniqueOrThrow({
        where: {
          venueId_month: { venueId, month: new Date(date.slice(0, 7) + "-01") },
        },
      }),
      tx.sale.aggregate({
        where: {
          venueId,
          businessDate: {
            gte: new Date(month.start),
            lte: new Date(month.end),
          },
        },
        _sum: { revenue: true },
      }),
      tx.importRun.findMany({ where: { venueId }, take: 30 }),
      tx.absence.findMany({
        where: { venueId },
        include: { assignment: { include: { employee: true } } },
        take: 30,
      }),
      tx.auditLog.findMany({
        where: { venueId },
        include: { actor: { select: { name: true } } },
        take: 30,
      }),
    ]);
    const items = new Map(),
      trend = new Map();
    for (const sale of sales) {
      const day = sale.businessDate.toISOString().slice(0, 10);
      trend.set(day, (trend.get(day) || 0) + Number(sale.revenue));
      for (const item of sale.items) {
        const key = item.product + "|" + item.category;
        const p = items.get(key) || {
          product: item.product,
          category: item.category,
          quantity: 0,
          revenue: 0,
        };
        p.quantity += item.quantity;
        p.revenue += Number(item.revenue);
        items.set(key, p);
      }
    }
    const prior = new Date(date + "T00:00:00Z");
    if (period === "month") {
      prior.setUTCDate(1);
      prior.setUTCMonth(prior.getUTCMonth() - 1);
    } else prior.setUTCDate(prior.getUTCDate() - (period === "week" ? 7 : 1));
    const previous = periodRange(prior.toISOString().slice(0, 10), period);
    const previousSales = await tx.sale.aggregate({
      where: {
        venueId,
        businessDate: {
          gte: new Date(previous.start),
          lte: new Date(previous.end),
        },
      },
      _sum: { revenue: true },
    });
    return {
      venueId,
      range: r,
      summary: {
        revenue: sales.reduce((s, a) => s + Number(a.revenue), 0),
        covers: sales.reduce((s, a) => s + a.covers, 0),
        desserts: sales.reduce((s, a) => s + a.desserts, 0),
        hours: attendances.reduce((s, a) => s + attendanceHours(a), 0),
        cost: attendances.reduce(
          (s, a) => s + attendanceHours(a) * Number(a.hourlyCost),
          0,
        ),
        monthRevenue: Number(monthly._sum.revenue || 0),
        previousRevenue: Number(previousSales._sum.revenue || 0),
      },
      employees: employees.map((a) => ({
        employeeId: a.employeeId,
        name: a.employee.displayName,
        jobTitle: a.jobTitle,
        hourlyCost: Number(a.hourlyCost),
      })),
      shifts: shifts.map((a) => ({
        ...a,
        name: a.assignment.employee.displayName,
      })),
      attendances: attendances.map((a) => ({
        ...a,
        name: a.assignment.employee.displayName,
        hours: attendanceHours(a),
      })),
      openAttendance: null,
      absences: absences.map((a) => ({
        ...a,
        name: a.assignment.employee.displayName,
      })),
      items: [...items.values()],
      trend: [...trend].sort().map(([date, revenue]) => ({ date, revenue })),
      goal: {
        dessertPercent: Number(goal.dessertPercent),
        revenueTarget: Number(goal.revenueTarget),
        dailyRevenueTarget: Number(goal.dailyRevenueTarget),
      },
      imports,
      audit: audit.map((a) => ({ ...a, actor: a.actor.name })),
    };
  });
}
async function setup() {
  fs.mkdirSync(output, { recursive: true });
  props = await readOnly(async (tx) => {
    const u = await tx.user.findFirstOrThrow({
      where: { role: "ADMIN" },
      select: {
        name: true,
        role: true,
        memberships: {
          select: { venue: { select: { id: true, name: true } } },
        },
      },
    });
    return {
      user: { name: u.name, role: u.role, employeeId: null },
      venues: u.memberships.map((m) => m.venue),
    };
  });
  await build({
    stdin: {
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import Workspace from './app/workspace';import Login from './app/login/form';createRoot(document.getElementById('root')).render(location.pathname==='/login'?<Login/>:<Workspace {...window.props}/>);`,
      resolveDir: root,
      loader: "tsx",
    },
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    outfile: path.join(output, "ui.js"),
  });
  const css = fs
    .readdirSync(".next/static/css")
    .filter((f) => f.endsWith(".css"))
    .map((f) => fs.readFileSync(".next/static/css/" + f, "utf8"))
    .join("\n");
  server = http.createServer(async (req, res) => {
    try {
      if (req.method !== "GET") {
        writes++;
        res.writeHead(405);
        res.end();
        return;
      }
      if (req.url.startsWith("/api/data")) {
        const q = new URL(req.url, "http://localhost").searchParams;
        const data = await snapshot(
          q.get("venueId"),
          q.get("date"),
          q.get("period"),
        );
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
        return;
      }
      if (req.url === "/ui.js") {
        res.setHeader("Content-Type", "application/javascript");
        res.end(fs.readFileSync(path.join(output, "ui.js")));
        return;
      }
      if (req.url === "/ui.css") {
        res.setHeader("Content-Type", "text/css");
        res.end(css);
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        `<html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><div id="root"></div><script>window.props=${JSON.stringify(props).replaceAll("<", "\\u003c")}</script><script src="/ui.js"></script></html>`,
      );
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Operazione non riuscita. Riprova." }));
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
}
const ready = setup();
async function loaded(page) {
  await page.locator(".kpis").waitFor();
}
test("UI desktop: sezioni, dati letti soltanto, filtri e colore Marina", async () => {
  await ready;
  const p = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  await p.goto(origin);
  await loaded(p);
  assert.equal(await p.locator("nav button").count(), 5);
  assert.equal(
    await p.locator(".venue-pill").innerText(),
    props.venues[0].name,
  );
  assert.equal(
    await p
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(245, 247, 251)",
  );
  assert.equal(
    await p
      .locator(".kpi-0")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(23, 61, 122)",
  );
  const labels = ["Dashboard", "Personale", "Incassi", "Vendite", "Obiettivi"];
  for (const name of labels) {
    await p.getByRole("button", { name, exact: true }).click();
    assert.equal(
      await p.locator('nav [aria-current="page"]').innerText(),
      name,
    );
  }
  await p.getByRole("button", { name: "Dashboard", exact: true }).click();
  await p.getByLabel("Locale", { exact: true }).selectOption("marina");
  await loaded(p);
  assert.equal(
    await p
      .locator(".venue-pill")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(242, 140, 40)",
  );
  await p.getByLabel("Locale", { exact: true }).selectOption("bistro");
  await p.getByLabel("Periodo", { exact: true }).selectOption("week");
  await loaded(p);
  const expected = await snapshot("bistro", today(), "week");
  const displayed = await p.locator(".kpi-0 strong").innerText();
  assert.equal(
    displayed,
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(expected.summary.revenue),
  );
  await p.screenshot({
    path: path.join(output, "desktop.png"),
    fullPage: true,
  });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await p.close();
});
test("UI smartphone e tablet: nessun overflow, navigazione e touch target", async () => {
  await ready;
  for (const width of [320, 390, 768, 1024]) {
    const p = await browser.newPage({
      viewport: { width, height: 844 },
      isMobile: width < 650,
      hasTouch: width < 650,
    });
    await p.goto(origin);
    await loaded(p);
    for (const name of [
      "Dashboard",
      "Personale",
      "Incassi",
      "Vendite",
      "Obiettivi",
    ]) {
      await p.getByRole("button", { name, exact: true }).click();
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${width}: ${name}`,
      );
    }
    const targets = await p
      .locator("nav button")
      .evaluateAll((nodes) =>
        nodes.every((e) => e.getBoundingClientRect().height >= 44),
      );
    assert.equal(targets, true);
    if (width === 390) {
      await p.getByRole("button", { name: "Dashboard", exact: true }).click();
      await p.screenshot({
        path: path.join(output, "iphone.png"),
        fullPage: true,
      });
    }
    await p.close();
  }
});
test("UI caricamento, errore, login mobile e focus tastiera", async () => {
  await ready;
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.route("**/api/data?**", async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Operazione non riuscita. Riprova." }),
    });
  });
  await p.goto(origin);
  await p.locator('[aria-busy="true"]').waitFor();
  await p.getByRole("alert").waitFor();
  assert.equal(await p.locator('[aria-busy="true"]').count(), 0);
  await p.goto(origin + "/login");
  assert.equal(await p.locator(".brand").isVisible(), true);
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await p.getByLabel("Email", { exact: true }).focus();
  assert.equal(
    await p
      .getByLabel("Email", { exact: true })
      .evaluate((e) => getComputedStyle(e).outlineStyle),
    "solid",
  );
  await p.close();
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
  await db.$disconnect();
  assert.equal(
    writes,
    0,
    "Nessuna richiesta di scrittura deve raggiungere il server isolato",
  );
});

test("UI contrasto del testo almeno 4.5:1 e indicatore Marina", async () => {
  await ready;
  const p = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  await p.goto(origin);
  await loaded(p);
  const selectors = [
    "nav button.active",
    ".eyebrow",
    ".filters label",
    ".kpi > div",
    ".kpi footer span",
    ".kpi footer b",
    ".chart-note",
    ".card p",
    ".demo",
    ".page-footer",
    ".actual-chart small",
  ];
  async function contrast(selector) {
    return p.locator(selector).evaluateAll((nodes) =>
      nodes.map((e) => {
        const rgb = (s) =>
          s
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number);
        const luminance = (values) =>
          values
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
        const fg = luminance(rgb(getComputedStyle(e).color));
        let parent = e,
          bg = "rgba(0, 0, 0, 0)";
        while (parent) {
          bg = getComputedStyle(parent).backgroundColor;
          if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") break;
          parent = parent.parentElement;
        }
        const back = luminance(
          rgb(
            bg === "transparent" || bg === "rgba(0, 0, 0, 0)"
              ? "rgb(255,255,255)"
              : bg,
          ),
        );
        return (Math.max(fg, back) + 0.05) / (Math.min(fg, back) + 0.05);
      }),
    );
  }
  for (const selector of selectors) {
    for (const ratio of await contrast(selector))
      assert.ok(ratio >= 4.5, `${selector}: ${ratio.toFixed(2)}:1`);
  }
  await p.getByLabel("Locale", { exact: true }).selectOption("marina");
  await loaded(p);
  for (const ratio of await contrast(".venue-pill.marina"))
    assert.ok(ratio >= 4.5);
  await p.close();
});
