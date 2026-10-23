import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { hashPassword } from "../lib/password";
import { today } from "../lib/time";
const db = new PrismaClient();
async function main() {
  mkdirSync(".local", { recursive: true, mode: 0o700 });
  const file = ".local/demo-accounts.json";
  const accounts: {
    email: string;
    password: string;
    role: "ADMIN" | "MANAGER" | "EMPLOYEE";
    venues: string[];
    name: string;
  }[] = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : [
        {
          email: "admin@bistro.test",
          name: "Amministratore Demo",
          role: "ADMIN",
          venues: ["bistro", "marina"],
          password: randomBytes(18).toString("base64url"),
        },
        {
          email: "responsabile@bistro.test",
          name: "Anna Demo",
          role: "MANAGER",
          venues: ["bistro"],
          password: randomBytes(18).toString("base64url"),
        },
        {
          email: "responsabile@marina.test",
          name: "Luca Demo",
          role: "MANAGER",
          venues: ["marina"],
          password: randomBytes(18).toString("base64url"),
        },
        {
          email: "dipendente@bistro.test",
          name: "Marco Esempio",
          role: "EMPLOYEE",
          venues: ["bistro"],
          password: randomBytes(18).toString("base64url"),
        },
      ];
  if (!existsSync(file))
    writeFileSync(file, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  for (const [id, name] of [
    ["bistro", "Bistrò"],
    ["marina", "Marina di Levante"],
  ])
    await db.venue.upsert({ where: { id }, update: {}, create: { id, name } });
  for (const a of accounts) {
    const user = await db.user.upsert({
      where: { email: a.email },
      update: {},
      create: {
        email: a.email,
        name: a.name,
        role: a.role,
        passwordHash: await hashPassword(a.password),
      },
    });
    for (const venueId of a.venues)
      await db.membership.upsert({
        where: { userId_venueId: { userId: user.id, venueId } },
        update: {},
        create: { userId: user.id, venueId },
      });
    if (a.role !== "ADMIN") {
      const employee = await db.employee.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, displayName: a.name },
      });
      for (const venueId of a.venues)
        await db.employeeVenue.upsert({
          where: { employeeId_venueId: { employeeId: employee.id, venueId } },
          update: {},
          create: {
            employeeId: employee.id,
            venueId,
            jobTitle: a.role === "MANAGER" ? "Responsabile" : "Bartender",
            hourlyCost: a.role === "MANAGER" ? 18 : 14,
          },
        });
    }
  }
  const ref = today();
  for (const venueId of ["bistro", "marina"]) {
    await db.goal.upsert({
      where: {
        venueId_month: { venueId, month: new Date(ref.slice(0, 7) + "-01") },
      },
      update: {},
      create: {
        venueId,
        month: new Date(ref.slice(0, 7) + "-01"),
        revenueTarget: venueId === "bistro" ? 70000 : 50000,
        dailyRevenueTarget: venueId === "bistro" ? 3000 : 2000,
      },
    });
    for (let offset = 0; offset < 40; offset++) {
      const date = new Date(ref + "T00:00:00Z");
      date.setUTCDate(date.getUTCDate() - offset);
      const rev =
        (venueId === "bistro" ? 2300 : 1500) + ((39 - offset) % 7) * 130;
      const receipt = "DEMO-" + date.toISOString().slice(0, 10);
      const exists = await db.sale.findUnique({
        where: {
          venueId_businessDate_receipt: {
            venueId,
            businessDate: date,
            receipt,
          },
        },
      });
      if (!exists)
        await db.sale.create({
          data: {
            venueId,
            businessDate: date,
            receipt,
            revenue: rev,
            covers: venueId === "bistro" ? 80 : 55,
            desserts: venueId === "bistro" ? 14 : 7,
            items: {
              create: [
                {
                  product: "Cocktail signature",
                  category: "Bar",
                  quantity: 30,
                  revenue: rev * 0.4,
                },
                {
                  product: "Primo di mare",
                  category: "Cucina",
                  quantity: 40,
                  revenue: rev * 0.5,
                },
                {
                  product: "Dolce della casa",
                  category: "Dolci",
                  quantity: venueId === "bistro" ? 14 : 7,
                  revenue: rev * 0.1,
                },
              ],
            },
          },
        });
    }
  }
  const assignments = await db.employeeVenue.findMany();
  for (const a of assignments) {
    const startsAt = new Date(ref + "T08:00:00Z"),
      endsAt = new Date(ref + "T16:00:00Z");
    const previousStart = new Date(startsAt.getTime() - 86400000),
      previousEnd = new Date(endsAt.getTime() - 86400000);
    if (
      !(await db.shift.findFirst({
        where: { employeeId: a.employeeId, venueId: a.venueId },
      }))
    )
      await db.shift.create({
        data: {
          employeeId: a.employeeId,
          venueId: a.venueId,
          startsAt,
          endsAt,
        },
      });
    if (
      !(await db.attendance.findFirst({
        where: { employeeId: a.employeeId, venueId: a.venueId },
      }))
    )
      await db.attendance.create({
        data: {
          employeeId: a.employeeId,
          venueId: a.venueId,
          startsAt: previousStart,
          endsAt: previousEnd,
          pauseMinutes: 30,
          hourlyCost: a.hourlyCost,
        },
      });
  }
  console.log(
    "Seed idempotente completato: solo dati fittizi. Password nel file locale riservato; nessun valore stampato.",
  );
}
main().finally(() => db.$disconnect());
