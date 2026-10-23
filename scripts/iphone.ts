import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";
const candidates = Object.entries(networkInterfaces())
  .filter(([name]) => !/(utun|tun|docker|bridge)/i.test(name))
  .flatMap(([, addresses]) => addresses ?? [])
  .filter(
    (a) =>
      a.family === "IPv4" &&
      !a.internal &&
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address),
  );
const address = process.env.LAN_IP || candidates[0]?.address;
if (!address || !/^\d{1,3}(\.\d{1,3}){3}$/.test(address))
  throw Error(
    "Rete privata IPv4 non trovata. Imposta LAN_IP con l’indirizzo Wi-Fi del Mac.",
  );
const origin = `http://${address}:3000`;
console.log(
  `Anteprima nella tua rete Wi-Fi: ${origin}\nApri questo indirizzo in Safari su iPhone. Nessun tunnel pubblico viene creato.\nAnche sul Mac usa lo stesso indirizzo per accedere.`,
);
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--hostname", "0.0.0.0"],
  { stdio: "inherit", env: { ...process.env, APP_ORIGIN: origin } },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
