// A parancssor végigfuttatása belépés nélkül (--csak-feldolgozas), kitalált
// letöltött levelekkel.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { tempDir, writeCompanyList, writeTarhely } from "./helpers.ts";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

function run(args: readonly string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env } });
}

async function project(): Promise<{ base: string; configPath: string }> {
  const base = tempDir("cli");
  const configPath = join(base, "beallitasok.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      alapertelmezett_cimzett: "iroda@example.com",
      kihagyott_tipusok: ["Feladási igazolás"],
      smtp: { kiszolgalo: "127.0.0.1", port: 9, felhasznalo: "", felado: "tarhely@example.com" }
    })
  );
  await writeCompanyList(join(base, "ceglista.xlsx"));
  return { base, configPath };
}

describe("parancssor", () => {
  it("próbafutás: .eml fájlok és külön próbanapló", async () => {
    const { base, configPath } = await project();
    writeTarhely(join(base, "adat", "tarhely"), [
      { eid: "A1", mailbox: "12345678 (Példa Kft)", desc: "Felhívás", fixture: "felhivas.pdf" },
      { eid: "B2", mailbox: "99999999 (Ismeretlen Zrt)", desc: "Végzés", text: "" }
    ]);
    const result = run(["futtatas", "--csak-feldolgozas", "--proba", "--beallitasok", configPath]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Kész: 2 új levél, 2 e-mail \(\.eml fájlba\)/);
    assert.equal(readdirSync(join(base, "adat", "proba-emailek")).length, 2);
    assert.ok(existsSync(join(base, "letoltesek-proba.xlsx")));
    assert.ok(!existsSync(join(base, "letoltesek.xlsx")));
    assert.ok(!existsSync(join(base, "adat", "futas.lock")), "a zárfájl felszabadul");
    assert.ok(readdirSync(join(base, "adat", "naplo")).length === 1, "havi futásnapló");
  });

  it("első futás dátumkorlát nélkül: nem lép be, megmondja a teendőt", async () => {
    const { configPath } = await project();
    const result = run(["futtatas", "--beallitasok", configPath]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Első futás: add meg, mettől/);
  });

  it("elérhetetlen levelezőszervernél hibával tér vissza", async () => {
    const { base, configPath } = await project();
    writeTarhely(join(base, "adat", "tarhely"), [
      { eid: "A1", mailbox: "12345678 (Példa Kft)", desc: "Felhívás", text: "" }
    ]);
    const result = run(["futtatas", "--csak-feldolgozas", "--beallitasok", configPath]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /E-mail HIBA \(A1\)/);
    assert.ok(existsSync(join(base, "letoltesek.xlsx")), "a napló a hiba ellenére is frissül");
  });

  it("hibás --since érték", async () => {
    const { configPath } = await project();
    const result = run(["futtatas", "--since", "2026.10.01", "--beallitasok", configPath]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ÉÉÉÉ-HH-NN/);
  });
});
