import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../lib/password";
test("password: salt diverso, verifica e rifiuto credenziale errata", async () => {
  const a = await hashPassword("Credenziale di test soltanto"),
    b = await hashPassword("Credenziale di test soltanto");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("Credenziale di test soltanto", a), true);
  assert.equal(await verifyPassword("Password sbagliata", a), false);
});
