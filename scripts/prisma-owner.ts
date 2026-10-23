import { spawn } from "node:child_process";
if (!process.env.MIGRATION_DATABASE_URL)
  throw Error(
    "MIGRATION_DATABASE_URL mancante: eseguire setup:local o configurare il proprietario del database.",
  );
const child = spawn(
  process.execPath,
  ["node_modules/prisma/build/index.js", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.MIGRATION_DATABASE_URL },
  },
);
child.on("exit", (code) => process.exit(code ?? 1));
