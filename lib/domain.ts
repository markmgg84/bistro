import { z } from "zod";
export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";
export function authorize(
  role: Role,
  action: "read" | "editAttendance" | "configure",
) {
  return (
    action === "read" ||
    role === "ADMIN" ||
    (role === "MANAGER" && action === "editAttendance")
  );
}
export function workedHours(start: string, end: string, pause: number) {
  const minutes = (Date.parse(end) - Date.parse(start)) / 60000;
  if (
    !Number.isFinite(minutes) ||
    minutes < 0 ||
    !Number.isFinite(pause) ||
    pause < 0 ||
    pause > minutes
  )
    throw Error("Intervallo non valido");
  return (minutes - pause) / 60;
}
export function metrics(
  revenue: number,
  covers: number,
  hours: number,
  cost: number,
) {
  return {
    average: covers ? revenue / covers : 0,
    staffRatio: revenue ? (cost / revenue) * 100 : 0,
    revenuePerHour: hours ? revenue / hours : 0,
  };
}
const requiredNumber = z
  .union([z.number(), z.string().trim().min(1)])
  .pipe(z.coerce.number());
export const saleSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => {
      const time = Date.parse(s);
      return (
        Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === s
      );
    }, "Data non valida"),
  receipt: z.string().trim().min(1),
  revenue: requiredNumber.pipe(z.number().finite().nonnegative()),
  covers: requiredNumber.pipe(z.number().int().nonnegative()),
  desserts: requiredNumber.pipe(z.number().int().nonnegative()),
});
export type Sale = z.infer<typeof saleSchema>;
export function validateSales(
  rows: Record<string, unknown>[],
  existing: Set<string> = new Set(),
) {
  const seen = new Set(existing);
  return rows.map((row, index) => {
    const p = saleSchema.safeParse(row);
    if (!p.success)
      return {
        index,
        valid: false,
        error: p.error.issues.map((x) => `${x.path}: ${x.message}`).join(", "),
      };
    const key = `${p.data.date}:${p.data.receipt}`;
    if (seen.has(key))
      return { index, valid: false, error: "Scontrino duplicato" };
    seen.add(key);
    return { index, valid: true, data: p.data };
  });
}
