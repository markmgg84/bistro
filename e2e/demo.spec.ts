import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { today } from "../lib/time";
const accounts: { email: string; password: string; role: string }[] =
  JSON.parse(readFileSync(".local/demo-accounts.json", "utf8"));
const origin = "http://localhost:3100";
const db = new PrismaClient();
const account = (role: string, email?: string) =>
  accounts.find((a) => a.role === role && (!email || a.email === email))!;
async function login(page: Page, role = "ADMIN", email?: string) {
  const a = account(role, email);
  const response = await page.request.post("/api/auth/login", {
    headers: { Origin: origin },
    data: { email: a.email, password: a.password },
  });
  expect(response.status()).toBe(200);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
async function post(
  page: Page,
  path: string,
  data: Record<string, unknown>,
  customOrigin = origin,
) {
  return page.request.post("/api/" + path, {
    headers: { Origin: customOrigin },
    data,
  });
}
test.afterAll(() => db.$disconnect());
test("accesso da form e logout con revoca della sessione", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  const a = account("ADMIN");
  await page.getByLabel("Email", { exact: true }).fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ogni numero, una prospettiva." }),
  ).toBeVisible();
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "bistro_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
  await page.getByRole("button", { name: "Esci", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.context().addCookies([
    {
      name: "bistro_session",
      value: session!.value,
      domain: "localhost",
      path: "/",
    },
  ]);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});
test("separazione locali e autorizzazioni lato server", async ({ page }) => {
  await login(page, "MANAGER", "responsabile@bistro.test");
  await expect(
    page.getByLabel("Locale", { exact: true }).locator("option"),
  ).toHaveCount(1);
  expect((await page.request.get("/api/data?venueId=marina")).status()).toBe(
    403,
  );
  const result = await post(page, "goals", {
    venueId: "bistro",
    month: today().slice(0, 7) + "-01",
    dessertPercent: 21,
    revenueTarget: 100,
    dailyRevenueTarget: 10,
  });
  expect(result.status()).toBe(403);
  expect(
    (
      await post(page, "employees", {
        venueId: "marina",
        name: "Intrusione test",
        jobTitle: "Test",
        hourlyCost: 10,
      })
    ).status(),
  ).toBe(403);
});
test("dipendente: dati propri, costi nascosti e rettifiche vietate", async ({
  page,
}) => {
  await login(page, "EMPLOYEE");
  await expect(
    page.getByRole("button", { name: "Incassi", exact: true }),
  ).toHaveCount(0);
  const data = await (
    await page.request.get("/api/data?venueId=bistro")
  ).json();
  expect(data.summary.revenue).toBeUndefined();
  expect(data.employees).toHaveLength(1);
  expect(data.employees[0].hourlyCost).toBeUndefined();
  expect(
    (
      await post(page, "employees", {
        venueId: "bistro",
        name: "Test vietato",
        jobTitle: "Test",
        hourlyCost: 10,
      })
    ).status(),
  ).toBe(403);
  expect(
    (await post(page, "attendance/correct", { venueId: "bistro" })).status(),
  ).toBe(403);
});
test("mutazioni rifiutate senza sessione e con origine esterna", async ({
  page,
}) => {
  expect((await post(page, "goals", { venueId: "bistro" })).status()).toBe(401);
  await login(page);
  expect(
    (
      await post(page, "goals", { venueId: "bistro" }, "https://altro.example")
    ).status(),
  ).toBe(403);
});
test("obiettivo persistente dopo ricarica e isolato da Marina", async ({
  page,
}) => {
  await login(page);
  const month = today().slice(0, 7) + "-01";
  const initial = await (
    await page.request.get("/api/data?venueId=bistro")
  ).json();
  const marina = await (
    await page.request.get("/api/data?venueId=marina")
  ).json();
  try {
    await page.getByRole("button", { name: "Obiettivi", exact: true }).click();
    await page.getByLabel("Obiettivo dolci / coperti (%)").fill("22");
    await page.getByRole("button", { name: "Salva obiettivi" }).click();
    await expect(page.getByRole("status")).toContainText("salvata");
    await page.reload();
    await page.getByRole("button", { name: "Obiettivi", exact: true }).click();
    await expect(page.getByLabel("Obiettivo dolci / coperti (%)")).toHaveValue(
      "22",
    );
    const other = await (
      await page.request.get("/api/data?venueId=marina")
    ).json();
    expect(other.goal).toEqual(marina.goal);
    const audit = await db.auditLog.findFirst({
      where: { venueId: "bistro", action: "GOAL_UPDATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
  } finally {
    expect(
      (
        await post(page, "goals", { venueId: "bistro", month, ...initial.goal })
      ).status(),
    ).toBe(200);
  }
});
test("CSV: salvataggio atomico, duplicati persistenti e scoping per locale", async ({
  page,
}) => {
  await login(page);
  const receipt = "E2E-" + Date.now(),
    filename = receipt + ".csv";
  try {
    await page.getByRole("button", { name: "Incassi", exact: true }).click();
    await page.locator("input[type=file]").setInputFiles({
      name: filename,
      mimeType: "text/csv",
      buffer: Buffer.from(
        `date,receipt,revenue,covers,desserts\n${today()},${receipt},120,4,1`,
      ),
    });
    await expect(
      page.getByText("1 valide · 0 errori o duplicati.", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Conferma importazione in Bistrò",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toContainText("salvata");
    await page.reload();
    await page.getByRole("button", { name: "Incassi", exact: true }).click();
    await expect(page.getByText(filename, { exact: false })).toBeVisible();
    const rows = [
      { date: today(), receipt, revenue: 120, covers: 4, desserts: 1 },
    ];
    expect(
      (
        await post(page, "imports", {
          venueId: "bistro",
          filename,
          rows: [...rows, { ...rows[0], receipt: receipt + "-extra" }],
        })
      ).status(),
    ).toBe(409);
    expect(
      await db.sale.count({ where: { receipt: receipt + "-extra" } }),
    ).toBe(0);
    expect(
      (
        await post(page, "imports", { venueId: "marina", filename, rows })
      ).status(),
    ).toBe(200);
    expect(await db.sale.count({ where: { receipt } })).toBe(2);
  } finally {
    await db.sale.deleteMany({ where: { receipt: { startsWith: receipt } } });
    await db.importRun.deleteMany({ where: { filename } });
  }
});
test("anagrafica e turno salvati e isolati per locale", async ({ page }) => {
  await login(page);
  const name = "Test fittizio " + Date.now();
  let employeeId = "";
  try {
    await page.getByRole("button", { name: "Personale", exact: true }).click();
    await page
      .getByText("Aggiungi dipendente fittizio", { exact: true })
      .click();
    await page.getByLabel("Nome dimostrativo").fill(name);
    await page.getByLabel("Mansione", { exact: true }).fill("Sala");
    await page.getByLabel("Costo orario (€)").fill("14");
    await page.getByRole("button", { name: "Salva dipendente" }).click();
    await expect(page.getByRole("status")).toContainText("salvata");
    await page.reload();
    await page.getByRole("button", { name: "Personale", exact: true }).click();
    const employee = await db.employee.findFirstOrThrow({
      where: { displayName: name },
    });
    employeeId = employee.id;
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
    const input = {
      employeeId,
      startsAt: "2027-04-10T17:00:00+02:00",
      endsAt: "2027-04-11T01:00:00+02:00",
    };
    expect(
      (await post(page, "shifts", { venueId: "bistro", ...input })).status(),
    ).toBe(200);
    expect(
      (await post(page, "shifts", { venueId: "bistro", ...input })).status(),
    ).toBe(409);
    expect(
      (await post(page, "shifts", { venueId: "marina", ...input })).status(),
    ).toBe(404);
  } finally {
    if (employeeId) {
      await db.shift.deleteMany({ where: { employeeId } });
      await db.employeeVenue.deleteMany({ where: { employeeId } });
      await db.employee.delete({ where: { id: employeeId } });
    }
  }
});
test("timbrature e pause effettive persistenti", async ({ page }) => {
  await login(page, "EMPLOYEE");
  const u = await db.user.findUniqueOrThrow({
    where: { email: account("EMPLOYEE").email },
    include: { employee: true },
  });
  let id = "";
  try {
    expect(
      (await post(page, "clock", { venueId: "bistro", action: "in" })).status(),
    ).toBe(200);
    const open = await db.attendance.findFirstOrThrow({
      where: { employeeId: u.employee!.id, endsAt: null },
    });
    id = open.id;
    expect(
      (await post(page, "clock", { venueId: "bistro", action: "in" })).status(),
    ).toBe(409);
    expect(
      (
        await post(page, "clock", { venueId: "bistro", action: "pause" })
      ).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.getByText(/Entrata .*In pausa/)).toBeVisible();
    expect(
      (
        await post(page, "clock", { venueId: "bistro", action: "resume" })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post(page, "clock", { venueId: "bistro", action: "out" })
      ).status(),
    ).toBe(200);
    const closed = await db.attendance.findUniqueOrThrow({
      where: { id },
      include: { pauses: true },
    });
    expect(closed.endsAt).not.toBeNull();
    expect(closed.pauses[0].endsAt).not.toBeNull();
  } finally {
    if (id) {
      await db.pause.deleteMany({ where: { attendanceId: id } });
      await db.attendance.delete({ where: { id } });
    }
  }
});
test("rettifica autorizzata: prima/dopo, motivo e conflitto versione", async ({
  page,
}) => {
  await login(page);
  const e = await db.employeeVenue.findFirstOrThrow({
    where: { venueId: "bistro" },
  });
  const a = await db.attendance.create({
    data: {
      employeeId: e.employeeId,
      venueId: "bistro",
      startsAt: new Date("2027-06-02T16:00Z"),
      endsAt: new Date("2027-06-02T23:00Z"),
      hourlyCost: 14,
    },
  });
  try {
    const input = {
      venueId: "bistro",
      id: a.id,
      version: 0,
      startsAt: "2027-06-02T16:00:00Z",
      endsAt: "2027-06-03T00:00:00Z",
      pauseMinutes: 30,
      reason: "Correzione automatica di test",
    };
    expect((await post(page, "attendance/correct", input)).status()).toBe(200);
    expect((await post(page, "attendance/correct", input)).status()).toBe(409);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: a.id, action: "ATTENDANCE_CORRECTED" },
    });
    expect(audit.before).toBeTruthy();
    expect(audit.after).toBeTruthy();
    expect(audit.reason).toBe(input.reason);
  } finally {
    await db.attendance.delete({ where: { id: a.id } });
  }
});
test("smartphone: login, navigazione e layout senza overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Personale", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Il team" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("PWA: fallback offline e nessuna cache di pagine autenticate", async ({
  page,
  context,
}) => {
  await login(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const keys = await page.evaluate(async () => {
    const names = await caches.keys();
    return Promise.all(
      names.map(async (name) =>
        (await (await caches.open(name)).keys()).map(
          (r) => new URL(r.url).pathname,
        ),
      ),
    );
  });
  expect(keys.flat()).not.toContain("/");
  expect(keys.flat()).not.toContain("/api/data");
  await context.setOffline(true);
  await page.goto("/offline-check");
  await expect(
    page.getByRole("heading", { name: "Ci rivediamo online." }),
  ).toBeVisible();
});
test("login: limitazione dei tentativi e rifiuto sessioni scadute", async ({
  page,
}) => {
  const email = "rate-test-" + Date.now() + "@example.test";
  const { createHash } = await import("node:crypto");
  const key = "email:" + createHash("sha256").update(email).digest("hex");
  try {
    for (let i = 0; i < 10; i++) {
      const r = await post(page, "auth/login", {
        email,
        password: "Password di test errata",
      });
      expect(r.status()).toBe(401);
    }
    expect(
      (
        await post(page, "auth/login", {
          email,
          password: "Password di test errata",
        })
      ).status(),
    ).toBe(429);
  } finally {
    await db.loginThrottle.deleteMany({ where: { key } });
  }
  await login(page);
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "bistro_session",
  )!;
  const id = createHash("sha256").update(cookie.value).digest("hex");
  await db.session.update({
    where: { id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});
