import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== "55432" ||
    url.pathname !== "/bistro" ||
    !existsSync(".local/postgres/PG_VERSION")
  )
    throw Error("Verifica consentita solo sul cluster locale del progetto");
  const bin =
    process.env.PG_BIN ||
    (existsSync("/workspace/postgres/usr/lib/postgresql/17/bin")
      ? "/workspace/postgres/usr/lib/postgresql/17/bin"
      : "");
  const pg = bin ? path.join(bin, "pg_ctl") : "pg_ctl";
  const db = new PrismaClient();
  const receipt = "RESTART-TEST-" + randomBytes(10).toString("hex");
  const marker = await db.sale.create({
    data: {
      venueId: "bistro",
      businessDate: new Date("2026-01-01"),
      receipt,
      revenue: 123.45,
      covers: 4,
      desserts: 1,
    },
  });
  await db.$disconnect();
  let restarted = false;
  try {
    execFileSync(
      pg,
      ["-D", path.resolve(".local/postgres"), "-m", "fast", "-w", "stop"],
      { stdio: "inherit" },
    );
    execFileSync("npm", ["run", "db:start"], { stdio: "inherit" });
    restarted = true;
    const actual = await db.sale.findUniqueOrThrow({
      where: { id: marker.id },
    });
    if (actual.receipt !== receipt || Number(actual.revenue) !== 123.45)
      throw Error("Valori differenti dopo il riavvio");
    console.log(
      "Persistenza verificata: record scritto prima dell’arresto presente dopo il riavvio PostgreSQL.",
    );
  } finally {
    if (!restarted)
      execFileSync("npm", ["run", "db:start"], { stdio: "inherit" });
    await db.sale.deleteMany({ where: { id: marker.id } });
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Verifica riavvio non riuscita: controllare lo stato del database locale.",
  );
  process.exitCode = 1;
});
