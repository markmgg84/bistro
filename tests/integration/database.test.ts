import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
test("PostgreSQL: migrazione applicata, ruolo applicativo senza DDL e audit immutabile", async () => {
  const role = await db.$queryRaw<
    { rolsuper: boolean }[]
  >`SELECT rolsuper FROM pg_roles WHERE rolname=current_user`;
  assert.equal(role[0].rolsuper, false);
  const grants = await db.$queryRaw<
    { update: boolean; delete: boolean; create: boolean }[]
  >`SELECT has_table_privilege(current_user,'"AuditLog"','UPDATE') AS update,has_table_privilege(current_user,'"AuditLog"','DELETE') AS delete,has_schema_privilege(current_user,'public','CREATE') AS create`;
  assert.deepEqual(grants[0], { update: false, delete: false, create: false });
});
test("vincolo tenant impedisce un turno per dipendente non assegnato al locale", async () => {
  const e = await db.employeeVenue.findFirstOrThrow({
    where: { venueId: "bistro" },
  });
  await assert.rejects(
    db.shift.create({
      data: {
        employeeId: e.employeeId,
        venueId: "marina",
        startsAt: new Date("2027-01-01T10:00Z"),
        endsAt: new Date("2027-01-01T12:00Z"),
      },
    }),
  );
});
test("presenze: una sola aperta anche tra due locali", async () => {
  const employee = await db.employee.create({
    data: {
      displayName: "Test automatico temporaneo",
      venues: {
        create: [
          { venueId: "bistro", hourlyCost: 10, jobTitle: "Test" },
          { venueId: "marina", hourlyCost: 10, jobTitle: "Test" },
        ],
      },
    },
  });
  try {
    await db.attendance.create({
      data: {
        venueId: "bistro",
        employeeId: employee.id,
        startsAt: new Date(),
        hourlyCost: 10,
      },
    });
    await assert.rejects(
      db.attendance.create({
        data: {
          venueId: "marina",
          employeeId: employee.id,
          startsAt: new Date(),
          hourlyCost: 10,
        },
      }),
    );
  } finally {
    await db.attendance.deleteMany({ where: { employeeId: employee.id } });
    await db.employeeVenue.deleteMany({ where: { employeeId: employee.id } });
    await db.employee.delete({ where: { id: employee.id } });
  }
});
test.after(async () => db.$disconnect());
