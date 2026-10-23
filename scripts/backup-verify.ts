import { PrismaClient } from "@prisma/client";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
async function main() {
  const value = process.env.MIGRATION_DATABASE_URL;
  if (!value) throw Error("MIGRATION_DATABASE_URL mancante");
  const url = new URL(value);
  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== "55432" ||
    url.pathname !== "/bistro"
  )
    throw Error("Verifica consentita solo sul database demo locale");
  const bin =
    process.env.PG_BIN ||
    (existsSync("/workspace/postgres/usr/lib/postgresql/17/bin")
      ? "/workspace/postgres/usr/lib/postgresql/17/bin"
      : "");
  const pg = (name: string) => (bin ? path.join(bin, name) : name);
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port,
    PGUSER: url.username,
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: "bistro",
  };
  const directory = ".local/backups";
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyFile = ".local/backup-key";
  if (!existsSync(keyFile))
    writeFileSync(keyFile, randomBytes(32), { mode: 0o600 });
  const key = readFileSync(keyFile),
    iv = randomBytes(12);
  const plain = execFileSync(
    pg("pg_dump"),
    ["--format=custom", "--no-owner", "--no-acl"],
    { env, maxBuffer: 64 * 1024 * 1024 },
  );
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    iv,
    cipher.update(plain),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const filename = path.join(directory, `demo-${Date.now()}.dump.enc`);
  writeFileSync(filename, encrypted, { mode: 0o600 });
  writeFileSync(
    filename + ".sha256",
    createHash("sha256").update(encrypted).digest("hex"),
    { mode: 0o600 },
  );
  const persisted = readFileSync(filename);
  if (
    createHash("sha256").update(persisted).digest("hex") !==
    readFileSync(filename + ".sha256", "utf8")
  )
    throw Error("Checksum archivio non corrispondente");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    persisted.subarray(0, 12),
  );
  decipher.setAuthTag(persisted.subarray(-16));
  const restored = Buffer.concat([
    decipher.update(persisted.subarray(12, -16)),
    decipher.final(),
  ]);
  const temp = path.join(directory, `restore-${Date.now()}.tmp`);
  writeFileSync(temp, restored, { mode: 0o600 });
  const name = "bistro_restore_" + randomBytes(6).toString("hex");
  let created = false;
  const source = new PrismaClient({ datasourceUrl: value });
  const targetUrl = new URL(value);
  targetUrl.pathname = "/" + name;
  const target = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  try {
    execFileSync(pg("createdb"), [name], { env });
    created = true;
    execFileSync(
      pg("pg_restore"),
      ["--no-owner", "--no-acl", "--exit-on-error", "--dbname=" + name, temp],
      { env },
    );
    const counts = async (db: PrismaClient) => ({
      users: await db.user.count(),
      venues: await db.venue.count(),
      sales: await db.sale.count(),
      attendances: await db.attendance.count(),
      audits: await db.auditLog.count(),
      revenue: String(
        (await db.sale.aggregate({ _sum: { revenue: true } }))._sum.revenue,
      ),
    });
    const a = await counts(source),
      b = await counts(target);
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw Error("Confronto ripristino non riuscito");
    console.log(
      "Backup AES-256-GCM e ripristino isolato verificati: conteggi e totale incassi coincidono.",
    );
    console.log("Archivio cifrato:", filename);
    console.log("Conservare backup-key separatamente dagli archivi.");
  } finally {
    await source.$disconnect();
    await target.$disconnect();
    unlinkSync(temp);
    if (created) execFileSync(pg("dropdb"), [name], { env });
  }
}
main().catch(() => {
  console.error(
    "Verifica backup non riuscita. Controllare PostgreSQL e configurazione locale.",
  );
  process.exitCode = 1;
});
