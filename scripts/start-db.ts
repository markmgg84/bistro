import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const bin =
  process.env.PG_BIN ||
  (existsSync("/workspace/postgres/usr/lib/postgresql/17/bin")
    ? "/workspace/postgres/usr/lib/postgresql/17/bin"
    : "");
const pg = bin ? path.join(bin, "pg_ctl") : "pg_ctl";
const data = path.resolve(".local/postgres");
if (!existsSync(path.join(data, "PG_VERSION")))
  throw Error("Eseguire prima npm run setup:local");
try {
  execFileSync(pg, ["-D", data, "status"], { stdio: "ignore" });
} catch {
  execFileSync(
    pg,
    [
      "-D",
      data,
      "-l",
      path.resolve(".local/postgres.log"),
      "-o",
      `-h 127.0.0.1 -p 55432 -k '${path.resolve(".local/socket").replaceAll("'", "'\\''")}'`,
      "-w",
      "start",
    ],
    { stdio: "inherit" },
  );
}
