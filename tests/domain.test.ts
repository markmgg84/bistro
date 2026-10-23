import { test } from "node:test";
import assert from "node:assert/strict";
import { workedHours, metrics, authorize, validateSales } from "../lib/domain";
test("turno oltre mezzanotte con pausa", () =>
  assert.equal(
    workedHours("2026-10-23T17:00:00+02:00", "2026-10-24T01:00:00+02:00", 30),
    7.5,
  ));
test("rifiuta pause e intervalli invalidi", () => {
  assert.throws(() => workedHours("2026-10-24", "2026-10-23", 0));
  assert.throws(() => workedHours("2026-10-23", "2026-10-24", 1500));
});
test("KPI e denominatori nulli", () => {
  assert.equal(metrics(1000, 50, 20, 250).staffRatio, 25);
  assert.equal(metrics(1000, 50, 20, 250).revenuePerHour, 50);
  assert.deepEqual(metrics(0, 0, 0, 0), {
    average: 0,
    staffRatio: 0,
    revenuePerHour: 0,
  });
});
test("politica autorizzazioni di base", () => {
  assert.equal(authorize("EMPLOYEE", "editAttendance"), false);
  assert.equal(authorize("MANAGER", "configure"), false);
  assert.equal(authorize("ADMIN", "configure"), true);
});
test("import: duplicati e valori negativi", () => {
  const row = {
    date: "2026-10-23",
    receipt: "A1",
    revenue: "123.50",
    covers: "5",
    desserts: "1",
  };
  const r = validateSales([row, row, { ...row, receipt: "B", revenue: -1 }]);
  assert.deepEqual(
    r.map((x) => x.valid),
    [true, false, false],
  );
});
test("rifiuta date inesistenti e celle numeriche vuote", () => {
  for (const row of [
    { date: "2026-02-30", receipt: "X", revenue: 10, covers: 1, desserts: 0 },
    { date: "2026-10-23", receipt: "X", revenue: "", covers: 1, desserts: 0 },
  ])
    assert.equal(validateSales([row])[0].valid, false);
});
test("turno con cambio ora legale: conta il tempo effettivo", () =>
  assert.equal(
    workedHours("2026-10-25T01:00:00+02:00", "2026-10-25T04:00:00+01:00", 30),
    3.5,
  ));
