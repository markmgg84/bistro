import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceHours, periodRange } from "../lib/time";
test("calcolo usato dall’API: turno oltre mezzanotte con due pause", () => {
  assert.equal(
    attendanceHours({
      startsAt: "2026-10-23T17:00:00+02:00",
      endsAt: "2026-10-24T01:00:00+02:00",
      pauseMinutes: 10,
      pauses: [
        {
          startsAt: "2026-10-23T20:00:00+02:00",
          endsAt: "2026-10-23T20:20:00+02:00",
        },
        {
          startsAt: "2026-10-23T22:00:00+02:00",
          endsAt: "2026-10-23T22:30:00+02:00",
        },
      ],
    }),
    7,
  );
});
test("pausa aperta: esclude il tempo fino al momento del calcolo", () => {
  assert.equal(
    attendanceHours(
      {
        startsAt: "2026-10-23T10:00:00Z",
        endsAt: null,
        pauseMinutes: 0,
        pauses: [{ startsAt: "2026-10-23T11:00:00Z", endsAt: null }],
      },
      new Date("2026-10-23T12:00:00Z"),
    ),
    1,
  );
});
test("giorno operativo Europe/Rome: rispetta la giornata di 25 ore", () => {
  const r = periodRange("2026-10-25", "day");
  assert.equal((r.endAt.getTime() - r.startAt.getTime()) / 3600000, 25);
  assert.equal(r.startAt.toISOString(), "2026-10-24T22:00:00.000Z");
});
test("settimana da lunedì a domenica e mese con anno bisestile", () => {
  const week = periodRange("2026-10-23", "week");
  assert.equal(week.start, "2026-10-19");
  assert.equal(week.end, "2026-10-25");
  assert.equal(periodRange("2028-02-10", "month").end, "2028-02-29");
});
