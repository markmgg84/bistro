import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
export const ZONE = "Europe/Rome";
export const today = () => formatInTimeZone(new Date(), ZONE, "yyyy-MM-dd");
export function periodRange(date: string, period: string) {
  const day = new Date(date + "T00:00:00Z");
  let start = date,
    end = date;
  if (period === "week") {
    const delta = (day.getUTCDay() + 6) % 7;
    day.setUTCDate(day.getUTCDate() - delta);
    start = day.toISOString().slice(0, 10);
    day.setUTCDate(day.getUTCDate() + 6);
    end = day.toISOString().slice(0, 10);
  }
  if (period === "month") {
    start = date.slice(0, 7) + "-01";
    end = new Date(
      Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0),
    )
      .toISOString()
      .slice(0, 10);
  }
  const next = new Date(end + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    start,
    end,
    startAt: fromZonedTime(start + "T00:00:00", ZONE),
    endAt: fromZonedTime(next.toISOString().slice(0, 10) + "T00:00:00", ZONE),
  };
}
export function attendanceHours(
  a: {
    startsAt: Date | string;
    endsAt: Date | string | null;
    pauseMinutes: number;
    pauses: { startsAt: Date | string; endsAt: Date | string | null }[];
  },
  now = new Date(),
) {
  const start = new Date(a.startsAt),
    end = a.endsAt ? new Date(a.endsAt) : now;
  const paused = a.pauses.reduce(
    (s, p) =>
      s +
      Math.max(
        0,
        (p.endsAt ? new Date(p.endsAt) : end).getTime() -
          new Date(p.startsAt).getTime(),
      ),
    0,
  );
  return Math.max(
    0,
    (end.getTime() - start.getTime() - paused - a.pauseMinutes * 60000) /
      3600000,
  );
}
