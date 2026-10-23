import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  unlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { parseEnv } from "node:util";
const root = process.cwd(),
  local = path.join(root, ".local");
mkdirSync(local, { recursive: true, mode: 0o700 });
const cloud = "/workspace/postgres/usr/lib/postgresql/17/bin";
const bin = process.env.PG_BIN || (existsSync(cloud) ? cloud : "");
const pg = (name: string) => (bin ? path.join(bin, name) : name);
if (!existsSync(".env")) {
  const owner = randomBytes(24).toString("hex"),
    app = randomBytes(24).toString("hex");
  writeFileSync(
    ".env",
    `DATABASE_URL="postgresql://bistro_app:${app}@127.0.0.1:55432/bistro?schema=public"\nMIGRATION_DATABASE_URL="postgresql://bistro_owner:${owner}@127.0.0.1:55432/bistro?schema=public"\nAPP_ORIGIN="http://localhost:3000"\n`,
    { mode: 0o600 },
  );
}
const config = parseEnv(readFileSync(".env", "utf8"));
if (!config.MIGRATION_DATABASE_URL || !config.DATABASE_URL)
  throw Error("Servono DATABASE_URL e MIGRATION_DATABASE_URL in .env");
const ownerUrl = new URL(config.MIGRATION_DATABASE_URL),
  appUrl = new URL(config.DATABASE_URL);
if (
  ownerUrl.hostname !== "127.0.0.1" ||
  ownerUrl.port !== "55432" ||
  ownerUrl.pathname !== "/bistro" ||
  ownerUrl.username !== "bistro_owner" ||
  appUrl.username !== "bistro_app"
)
  throw Error(
    "setup-local è riservato al database locale standard; per un DB esterno seguire README.",
  );
const data = path.join(local, "postgres"),
  socket = path.join(local, "socket");
mkdirSync(socket, { recursive: true, mode: 0o700 });
if (!existsSync(path.join(data, "PG_VERSION"))) {
  const pw = path.join(local, "init-password");
  writeFileSync(pw, decodeURIComponent(ownerUrl.password), { mode: 0o600 });
  try {
    const args = [
      "-D",
      data,
      "-U",
      "bistro_owner",
      "--auth-local=scram-sha-256",
      "--auth-host=scram-sha-256",
      "--pwfile=" + pw,
      "--encoding=UTF8",
      "--locale=C",
    ];
    if (bin === cloud)
      args.push("-L", "/workspace/postgres/usr/share/postgresql/17");
    execFileSync(pg("initdb"), args, { stdio: "inherit" });
  } finally {
    unlinkSync(pw);
  }
}
const status = () => {
  try {
    execFileSync(pg("pg_ctl"), ["-D", data, "status"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
if (!status())
  execFileSync(
    pg("pg_ctl"),
    [
      "-D",
      data,
      "-l",
      path.join(local, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p 55432 -k '${socket.replaceAll("'", "'\\''")}'`,
      "-w",
      "start",
    ],
    { stdio: "inherit" },
  );
const pgEnv = {
  ...process.env,
  PGHOST: "127.0.0.1",
  PGPORT: "55432",
  PGUSER: "bistro_owner",
  PGPASSWORD: decodeURIComponent(ownerUrl.password),
  PGDATABASE: "postgres",
};
function sql(query: string, database = "postgres") {
  return execFileSync(pg("psql"), ["-v", "ON_ERROR_STOP=1", "-At"], {
    env: { ...pgEnv, PGDATABASE: database },
    encoding: "utf8",
    input: query,
  }).trim();
}
if (sql("SELECT 1 FROM pg_roles WHERE rolname='bistro_app'") !== "1") {
  const password = decodeURIComponent(appUrl.password);
  if (!/^[a-f0-9]{48}$/.test(password)) throw Error("Password locale inattesa");
  sql(`CREATE ROLE bistro_app LOGIN PASSWORD '${password}'`);
}
if (sql("SELECT 1 FROM pg_database WHERE datname='bistro'") !== "1")
  sql("CREATE DATABASE bistro OWNER bistro_owner");
execFileSync("npm", ["run", "db:generate"], {
  env: { ...process.env, ...config },
  stdio: "inherit",
});
execFileSync("npm", ["run", "db:deploy"], {
  env: {
    ...process.env,
    ...config,
    DATABASE_URL: config.MIGRATION_DATABASE_URL,
  },
  stdio: "inherit",
});
sql("GRANT CONNECT ON DATABASE bistro TO bistro_app");
sql(
  'GRANT USAGE ON SCHEMA public TO bistro_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO bistro_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO bistro_app; REVOKE UPDATE,DELETE ON "AuditLog" FROM bistro_app; REVOKE ALL ON "_prisma_migrations" FROM bistro_app;',
  "bistro",
);
execFileSync("npm", ["run", "db:seed"], {
  env: { ...process.env, ...config },
  stdio: "inherit",
});
chmodSync(".env", 0o600);
console.log(
  "Database locale pronto. Account demo in .local/demo-accounts.json (file riservato).",
);
