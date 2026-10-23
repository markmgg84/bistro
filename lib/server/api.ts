import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  ApiError,
  assertOrigin,
  requireUser,
  requireVenue,
  requireManager,
  requireAdmin,
  newSession,
  cookieName,
  digest,
} from "./auth";
import { hashPassword, verifyPassword } from "../password";
import { saleSchema } from "../domain";
import { attendanceHours, periodRange, today } from "../time";
const id = z.string().min(1).max(100);
const date = saleSchema.shape.date;
const instant = z.string().datetime({ offset: true });
const money = z.number().finite().min(0).max(100000000).multipleOf(0.01);
const ctx = z.object({ venueId: id });
const userView = (u: {
  id: string;
  name: string;
  email: string;
  role: string;
  employee: { id: string } | null;
}) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  employeeId: u.employee?.id ?? null,
});
const json = (value: unknown) =>
  NextResponse.json(value, { headers: { "Cache-Control": "no-store" } });
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Richiesta vuota");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new ApiError(413, "Richiesta troppo grande");
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new ApiError(400, "JSON non valido");
  }
}
function validInterval(startsAt: string, endsAt: string) {
  const diff = Date.parse(endsAt) - Date.parse(startsAt);
  if (diff <= 0 || diff > 36 * 3600000)
    throw new ApiError(400, "Intervallo richiesto: da 1 minuto a 36 ore");
}
async function assignment(employeeId: string, venueId: string) {
  const a = await db.employeeVenue.findUnique({
    where: { employeeId_venueId: { employeeId, venueId } },
  });
  if (!a) throw new ApiError(404, "Dipendente non trovato nel locale");
  return a;
}
async function throttle(key: string) {
  const result = await db.$queryRaw<
    { failures: number }[]
  >`INSERT INTO "LoginThrottle" ("key","failures","windowStart") VALUES (${key},1,NOW()) ON CONFLICT ("key") DO UPDATE SET "failures"=CASE WHEN "LoginThrottle"."windowStart" < NOW()-INTERVAL '15 minutes' THEN 1 ELSE "LoginThrottle"."failures"+1 END, "windowStart"=CASE WHEN "LoginThrottle"."windowStart" < NOW()-INTERVAL '15 minutes' THEN NOW() ELSE "LoginThrottle"."windowStart" END RETURNING "failures"`;
  if (result[0].failures > 10)
    throw new ApiError(429, "Troppi tentativi. Riprova tra 15 minuti.");
}
export async function get(request: Request, path: string[]) {
  if (path.join("/") === "auth/me") {
    const u = await requireUser();
    return json({
      user: userView(u),
      venues: u.memberships.map((m) => m.venue),
    });
  }
  if (path.join("/") !== "data") throw new ApiError(404, "Risorsa non trovata");
  const query = z
    .object({
      venueId: id,
      date: date.default(today()),
      period: z.enum(["day", "week", "month"]).default("day"),
    })
    .parse(Object.fromEntries(new URL(request.url).searchParams));
  const u = await requireVenue(query.venueId);
  const financial = u.role !== "EMPLOYEE";
  const employeeId = financial ? undefined : (u.employee?.id ?? "__none__");
  const range = periodRange(query.date, query.period);
  const month = periodRange(query.date, "month");
  const priorDate = new Date(query.date + "T00:00:00Z");
  if (query.period === "month") {
    priorDate.setUTCDate(1);
    priorDate.setUTCMonth(priorDate.getUTCMonth() - 1);
  } else
    priorDate.setUTCDate(
      priorDate.getUTCDate() - (query.period === "week" ? 7 : 1),
    );
  const previous = periodRange(
    priorDate.toISOString().slice(0, 10),
    query.period,
  );
  const venueId = query.venueId;
  const [
    employees,
    shifts,
    attendances,
    openAttendance,
    absences,
    sales,
    monthSales,
    previousSales,
    goal,
    imports,
    audit,
  ] = await Promise.all([
    db.employeeVenue.findMany({
      where: { venueId, employeeId },
      include: { employee: true },
      orderBy: { employee: { displayName: "asc" } },
    }),
    db.shift.findMany({
      where: {
        venueId,
        employeeId,
        startsAt: { gte: range.startAt, lt: range.endAt },
      },
      include: { assignment: { include: { employee: true } } },
      orderBy: { startsAt: "asc" },
      take: 500,
    }),
    db.attendance.findMany({
      where: {
        venueId,
        employeeId,
        startsAt: { gte: range.startAt, lt: range.endAt },
      },
      include: { pauses: true, assignment: { include: { employee: true } } },
      orderBy: { startsAt: "desc" },
      take: 1000,
    }),
    u.employee
      ? db.attendance.findFirst({
          where: { venueId, employeeId: u.employee.id, endsAt: null },
          include: { pauses: true },
        })
      : null,
    db.absence.findMany({
      where: {
        venueId,
        employeeId,
        endsAt: { gte: range.startAt },
        startsAt: { lt: range.endAt },
      },
      include: { assignment: { include: { employee: true } } },
      take: 500,
    }),
    financial
      ? db.sale.findMany({
          where: {
            venueId,
            businessDate: {
              gte: new Date(range.start),
              lte: new Date(range.end),
            },
          },
          include: { items: true },
        })
      : [],
    financial
      ? db.sale.aggregate({
          where: {
            venueId,
            businessDate: {
              gte: new Date(month.start),
              lte: new Date(month.end),
            },
          },
          _sum: { revenue: true },
        })
      : null,
    financial
      ? db.sale.aggregate({
          where: {
            venueId,
            businessDate: {
              gte: new Date(previous.start),
              lte: new Date(previous.end),
            },
          },
          _sum: { revenue: true },
        })
      : null,
    financial
      ? db.goal.findUnique({
          where: {
            venueId_month: {
              venueId,
              month: new Date(query.date.slice(0, 7) + "-01"),
            },
          },
        })
      : null,
    financial
      ? db.importRun.findMany({
          where: { venueId },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : [],
    financial
      ? db.auditLog.findMany({
          where: { venueId },
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : [],
  ]);
  const revenue = sales.reduce((s, x) => s + Number(x.revenue), 0),
    covers = sales.reduce((s, x) => s + x.covers, 0),
    desserts = sales.reduce((s, x) => s + x.desserts, 0);
  const hours = attendances.reduce((s, a) => s + attendanceHours(a), 0),
    cost = attendances.reduce(
      (s, a) => s + attendanceHours(a) * Number(a.hourlyCost),
      0,
    );
  const grouped = new Map<
    string,
    { product: string; category: string; quantity: number; revenue: number }
  >();
  for (const sale of sales)
    for (const item of sale.items) {
      const key = item.product + "|" + item.category;
      const p = grouped.get(key) || {
        product: item.product,
        category: item.category,
        quantity: 0,
        revenue: 0,
      };
      p.quantity += item.quantity;
      p.revenue += Number(item.revenue);
      grouped.set(key, p);
    }
  const trend = new Map<string, number>();
  for (const s of sales) {
    const key = s.businessDate.toISOString().slice(0, 10);
    trend.set(key, (trend.get(key) || 0) + Number(s.revenue));
  }
  return json({
    user: userView(u),
    venueId,
    range: { start: range.start, end: range.end },
    summary: {
      hours,
      ...(financial
        ? {
            revenue,
            covers,
            desserts,
            cost,
            monthRevenue: Number(monthSales?._sum.revenue ?? 0),
            previousRevenue: Number(previousSales?._sum.revenue ?? 0),
          }
        : {}),
    },
    employees: employees.map((a) => ({
      employeeId: a.employeeId,
      name: a.employee.displayName,
      jobTitle: a.jobTitle,
      ...(financial ? { hourlyCost: Number(a.hourlyCost) } : {}),
    })),
    shifts: shifts.map((s) => ({
      id: s.id,
      employeeId: s.employeeId,
      name: s.assignment.employee.displayName,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
    })),
    attendances: attendances.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      name: a.assignment.employee.displayName,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      pauseMinutes: a.pauseMinutes,
      pauses: a.pauses,
      hours: attendanceHours(a),
      version: a.version,
    })),
    openAttendance: openAttendance
      ? {
          id: openAttendance.id,
          paused: openAttendance.pauses.some((p) => !p.endsAt),
          startsAt: openAttendance.startsAt,
        }
      : null,
    absences: absences.map((a) => ({
      id: a.id,
      name: a.assignment.employee.displayName,
      kind: a.kind,
      status: a.status,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
    })),
    items: [...grouped.values()],
    trend: [...trend].sort().map(([date, revenue]) => ({ date, revenue })),
    goal: goal
      ? {
          dessertPercent: Number(goal.dessertPercent),
          revenueTarget: Number(goal.revenueTarget),
          dailyRevenueTarget: Number(goal.dailyRevenueTarget),
        }
      : { dessertPercent: 15, revenueTarget: 120000, dailyRevenueTarget: 5000 },
    imports,
    audit: audit.map((a) => ({
      id: a.id,
      action: a.action,
      reason: a.reason,
      actor: a.actor.name,
      createdAt: a.createdAt,
    })),
  });
}
export async function post(request: Request, path: string[]) {
  assertOrigin(request);
  const route = path.join("/");
  const raw = await body(request);
  if (route === "auth/login") {
    const input = z
      .object({
        email: z
          .string()
          .email()
          .max(200)
          .transform((s) => s.toLowerCase().trim()),
        password: z.string().min(1).max(256),
      })
      .parse(raw);
    await throttle("email:" + digest(input.email));
    const user = await db.user.findUnique({ where: { email: input.email } });
    const fallback = await hashPassword("not-a-user-" + input.email);
    if (
      !(await verifyPassword(input.password, user?.passwordHash ?? fallback)) ||
      !user?.active
    )
      throw new ApiError(401, "Email o password non corretti");
    await db.loginThrottle.deleteMany({
      where: { key: "email:" + digest(input.email) },
    });
    const old = (await cookies()).get(cookieName)?.value;
    if (old) await db.session.deleteMany({ where: { id: digest(old) } });
    await newSession(user.id);
    return json({ ok: true });
  }
  if (route === "auth/logout") {
    await requireUser();
    const token = (await cookies()).get(cookieName)?.value;
    if (token) await db.session.deleteMany({ where: { id: digest(token) } });
    (await cookies()).delete(cookieName);
    return json({ ok: true });
  }
  const { venueId } = ctx.parse(raw);
  const user = await requireVenue(venueId);
  const audit = (
    action: string,
    entityId: string,
    reason: string,
    after?: Prisma.InputJsonValue,
  ) => ({ actorId: user.id, venueId, action, entityId, reason, after });
  if (route === "employees") {
    requireManager(user);
    const input = z
      .object({
        name: z.string().trim().min(2).max(80),
        jobTitle: z.string().trim().min(2).max(80),
        hourlyCost: money.max(1000),
      })
      .parse(raw);
    const record = await db.$transaction(async (tx) => {
      const e = await tx.employee.create({
        data: {
          displayName: input.name,
          venues: {
            create: {
              venueId,
              jobTitle: input.jobTitle,
              hourlyCost: input.hourlyCost,
            },
          },
        },
      });
      await tx.auditLog.create({
        data: audit("EMPLOYEE_CREATED", e.id, "Nuova anagrafica fittizia"),
      });
      return e;
    });
    return json({ id: record.id });
  }
  if (route === "shifts") {
    requireManager(user);
    const input = z
      .object({ employeeId: id, startsAt: instant, endsAt: instant })
      .parse(raw);
    validInterval(input.startsAt, input.endsAt);
    await assignment(input.employeeId, venueId);
    await db.$transaction(
      async (tx) => {
        if (
          await tx.shift.findFirst({
            where: {
              employeeId: input.employeeId,
              startsAt: { lt: new Date(input.endsAt) },
              endsAt: { gt: new Date(input.startsAt) },
            },
          })
        )
          throw new ApiError(409, "Il dipendente ha già un turno sovrapposto");
        const s = await tx.shift.create({ data: { venueId, ...input } });
        await tx.auditLog.create({
          data: audit("SHIFT_CREATED", s.id, "Pianificazione turno"),
        });
      },
      { isolationLevel: "Serializable" },
    );
    return json({ ok: true });
  }
  if (route === "clock") {
    if (!user.employee)
      throw new ApiError(400, "Questo account non è associato a un dipendente");
    const input = z
      .object({ action: z.enum(["in", "pause", "resume", "out"]) })
      .parse(raw);
    const a = await assignment(user.employee.id, venueId);
    await db.$transaction(
      async (tx) => {
        const open = await tx.attendance.findFirst({
          where: { employeeId: a.employeeId, endsAt: null },
          include: { pauses: true },
        });
        const now = new Date();
        if (input.action === "in") {
          if (open)
            throw new ApiError(
              409,
              "Esiste già una presenza aperta, anche in un altro locale",
            );
          if (
            await tx.attendance.findFirst({
              where: {
                employeeId: a.employeeId,
                startsAt: { lte: now },
                endsAt: { gt: now },
              },
            })
          )
            throw new ApiError(
              409,
              "La presenza si sovrappone a un intervallo già registrato",
            );
          const created = await tx.attendance.create({
            data: {
              venueId,
              employeeId: a.employeeId,
              startsAt: now,
              hourlyCost: a.hourlyCost,
            },
          });
          await tx.auditLog.create({
            data: audit("CLOCK_IN", created.id, "Timbratura personale"),
          });
          return;
        }
        if (!open || open.venueId !== venueId)
          throw new ApiError(409, "Nessuna presenza aperta in questo locale");
        const pause = open.pauses.find((p) => !p.endsAt);
        if (input.action === "pause") {
          if (pause) throw new ApiError(409, "Pausa già aperta");
          await tx.pause.create({
            data: { attendanceId: open.id, startsAt: now },
          });
        } else if (input.action === "resume") {
          if (!pause) throw new ApiError(409, "Nessuna pausa aperta");
          await tx.pause.update({
            where: { id: pause.id },
            data: { endsAt: now },
          });
        } else {
          if (pause)
            await tx.pause.update({
              where: { id: pause.id },
              data: { endsAt: now },
            });
          await tx.attendance.update({
            where: { id: open.id },
            data: { endsAt: now },
          });
        }
        await tx.attendance.update({
          where: { id: open.id },
          data: { version: { increment: 1 } },
        });
        await tx.auditLog.create({
          data: audit(
            "CLOCK_" + input.action.toUpperCase(),
            open.id,
            "Timbratura personale",
          ),
        });
      },
      { isolationLevel: "Serializable" },
    );
    return json({ ok: true });
  }
  if (route === "attendance/correct") {
    requireManager(user);
    const input = z
      .object({
        id,
        version: z.number().int().min(0),
        startsAt: instant,
        endsAt: instant,
        pauseMinutes: z.number().int().min(0),
        reason: z.string().trim().min(8).max(500),
      })
      .parse(raw);
    validInterval(input.startsAt, input.endsAt);
    if (
      input.pauseMinutes * 60000 >
      Date.parse(input.endsAt) - Date.parse(input.startsAt)
    )
      throw new ApiError(400, "La pausa supera il turno");
    await db.$transaction(
      async (tx) => {
        const before = await tx.attendance.findFirst({
          where: { id: input.id, venueId },
          include: { pauses: true },
        });
        if (!before) throw new ApiError(404, "Presenza non trovata");
        if (!before.endsAt)
          throw new ApiError(409, "Chiudi la presenza prima di rettificarla");
        if (
          await tx.attendance.findFirst({
            where: {
              id: { not: before.id },
              employeeId: before.employeeId,
              startsAt: { lt: new Date(input.endsAt) },
              OR: [
                { endsAt: null },
                { endsAt: { gt: new Date(input.startsAt) } },
              ],
            },
          })
        )
          throw new ApiError(409, "Presenze sovrapposte");
        const updated = await tx.attendance.updateMany({
          where: { id: input.id, venueId, version: input.version },
          data: {
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            pauseMinutes: input.pauseMinutes,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1)
          throw new ApiError(409, "Presenza modificata: aggiorna e riprova");
        await tx.pause.deleteMany({ where: { attendanceId: input.id } });
        await tx.auditLog.create({
          data: {
            ...audit(
              "ATTENDANCE_CORRECTED",
              input.id,
              input.reason,
              JSON.parse(JSON.stringify(input)),
            ),
            before: JSON.parse(JSON.stringify(before)),
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
    return json({ ok: true });
  }
  if (route === "absences") {
    const input = z
      .object({
        employeeId: id,
        startsAt: instant,
        endsAt: instant,
        kind: z.enum(["FERIE", "ASSENZA"]),
      })
      .parse(raw);
    if (user.role === "EMPLOYEE" && user.employee?.id !== input.employeeId)
      throw new ApiError(403, "Puoi inserire solo le tue richieste");
    if (Date.parse(input.endsAt) <= Date.parse(input.startsAt))
      throw new ApiError(400, "Date non valide");
    await assignment(input.employeeId, venueId);
    await db.$transaction(async (tx) => {
      const a = await tx.absence.create({ data: { venueId, ...input } });
      await tx.auditLog.create({
        data: audit("ABSENCE_REQUESTED", a.id, "Richiesta assenza"),
      });
    });
    return json({ ok: true });
  }
  if (route === "absences/approve") {
    requireManager(user);
    const input = z
      .object({ id, status: z.enum(["APPROVED", "REJECTED"]) })
      .parse(raw);
    await db.$transaction(async (tx) => {
      const a = await tx.absence.findFirst({
        where: { id: input.id, venueId },
      });
      if (!a) throw new ApiError(404, "Richiesta non trovata");
      if (a.employeeId === user.employee?.id && user.role !== "ADMIN")
        throw new ApiError(
          403,
          "Un responsabile non può approvare la propria richiesta",
        );
      await tx.absence.update({
        where: { id: a.id },
        data: { status: input.status },
      });
      await tx.auditLog.create({
        data: audit("ABSENCE_" + input.status, a.id, "Valutazione richiesta"),
      });
    });
    return json({ ok: true });
  }
  if (route === "goals") {
    requireAdmin(user);
    const input = z
      .object({
        month: date,
        dessertPercent: z.number().min(0).max(100),
        revenueTarget: money,
        dailyRevenueTarget: money,
      })
      .parse(raw);
    if (!input.month.endsWith("-01"))
      throw new ApiError(400, "Usa il primo giorno del mese");
    await db.$transaction(async (tx) => {
      const before = await tx.goal.findUnique({
        where: { venueId_month: { venueId, month: new Date(input.month) } },
      });
      const after = await tx.goal.upsert({
        where: { venueId_month: { venueId, month: new Date(input.month) } },
        create: { venueId, ...input, month: new Date(input.month) },
        update: { ...input, month: new Date(input.month) },
      });
      await tx.auditLog.create({
        data: {
          ...audit(
            "GOAL_UPDATED",
            after.id,
            "Aggiornamento obiettivi amministratore",
            JSON.parse(JSON.stringify(after)),
          ),
          before: before ? JSON.parse(JSON.stringify(before)) : Prisma.JsonNull,
        },
      });
    });
    return json({ ok: true });
  }
  if (route === "imports") {
    requireManager(user);
    const input = z
      .object({
        filename: z.string().trim().min(1).max(120),
        rows: z
          .array(saleSchema.extend({ revenue: money }))
          .min(1)
          .max(5000),
      })
      .parse(raw);
    const keys = input.rows.map((r) => r.date + ":" + r.receipt);
    if (new Set(keys).size !== keys.length)
      throw new ApiError(409, "Il file contiene scontrini duplicati");
    await db.$transaction(
      async (tx) => {
        const run = await tx.importRun.create({
          data: {
            venueId,
            actorId: user.id,
            filename: input.filename,
            status: "COMPLETED",
            accepted: input.rows.length,
            rejected: 0,
          },
        });
        await tx.sale.createMany({
          data: input.rows.map((r) => ({
            venueId,
            businessDate: new Date(r.date),
            receipt: r.receipt,
            revenue: r.revenue,
            covers: r.covers,
            desserts: r.desserts,
            importId: run.id,
          })),
        });
        await tx.auditLog.create({
          data: audit("IMPORT_COMPLETED", run.id, "Importazione validata", {
            rows: input.rows.length,
          }),
        });
      },
      { timeout: 20000 },
    );
    return json({ ok: true });
  }
  throw new ApiError(404, "Operazione non trovata");
}
export function failure(error: unknown) {
  if (error instanceof ApiError) return jsonError(error.status, error.message);
  if (error instanceof z.ZodError)
    return jsonError(
      400,
      "Dati non validi: " +
        error.issues.map((i) => i.path.join(".") + " " + i.message).join("; "),
    );
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      return jsonError(
        409,
        "Dato duplicato o presenza già aperta. Nessuna modifica applicata.",
      );
    if (error.code === "P2034")
      return jsonError(409, "Modifica simultanea: aggiorna e riprova.");
  }
  console.error("API error", error instanceof Error ? error.name : "Unknown");
  return jsonError(500, "Operazione non riuscita. Riprova.");
}
function jsonError(status: number, error: string) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
