import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";

import { operationArguments, type OperationRequest, type OperationView, type Operations } from "../src/ui/operations.ts";
import { startUi, type UiServer } from "../src/ui/server.ts";
import type { Credentials } from "../src/vendor/tarhely-cli/store/credentials.ts";
import { readRunStatus, writeRunStatus } from "../src/run-status.ts";

const PROJECT = resolve(import.meta.dirname, "..");

describe("műveletek argumentumai", () => {
  it("a parancssori kapcsolókra képződnek le", () => {
    assert.deepEqual(operationArguments({ name: "proba", since: "2026-10-01" }, "b.json"), ["futtatas", "--proba", "--since", "2026-10-01", "--beallitasok", "b.json"]);
    assert.deepEqual(operationArguments({ name: "futtatas", all: true }, "b.json"), ["futtatas", "--mind", "--beallitasok", "b.json"]);
    assert.deepEqual(operationArguments({ name: "teszt-email", to: "a@example.com" }, "b.json"), ["teszt-email", "a@example.com", "--beallitasok", "b.json"]);
  });
});

describe("futásállapot", () => {
  it("oda-vissza írható, hibás fájlra null", () => {
    const dir = mkdtempSync(join(tmpdir(), "tarhely-rs-"));
    assert.equal(readRunStatus(dir), null);
    writeRunStatus(dir, { mode: "proba", startedAt: "2026-10-29T08:00:00Z", finishedAt: null, exitCode: null, newLetters: 2, emailed: 1, unmatched: 0, skipped: 0, problems: ["x"] });
    assert.equal(readRunStatus(dir)?.newLetters, 2);
    writeFileSync(join(dir, "utolso-futas.json"), "nem json");
    assert.equal(readRunStatus(dir), null);
  });
});

describe("kezelőfelület-kiszolgáló", () => {
  let dir: string;
  let ui: UiServer;
  let cookie = "";
  let base = "";
  const started: OperationRequest[] = [];
  let stored: Credentials | null = null;
  let smtpSecret: string | null = null;
  const idle: OperationView = { name: null, running: false, startedAt: null, finishedAt: null, exitCode: null, lines: [] };
  const operations: Operations = {
    start(request) { started.push(request); return idle; },
    view: () => idle,
    stop() {}
  };

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "tarhely-ui-"));
    mkdirSync(join(dir, "adat"), { recursive: true });
    writeFileSync(join(dir, "beallitasok.json"), readFileSync(join(PROJECT, "beallitasok.minta.json")));
    ui = await startUi({
      projectDir: PROJECT,
      cliPath: join(PROJECT, "src", "cli.ts"),
      configPath: join(dir, "beallitasok.json"),
      port: 0,
      operations,
      deps: {
        ugyfelkapu: async () => ({ load: () => stored, save: (value: Credentials) => { stored = value; }, clear: () => { stored = null; } }) as never,
        smtpKeyring: { get: () => smtpSecret, set: (value: string) => { smtpSecret = value; }, clear: () => { smtpSecret = null; } } as never,
        chromiumInstalled: async () => true,
        validTotpSeed: async (value) => /^[A-Z2-7]{16,}$/u.test(value),
        schedule: { platform: "linux", command: "", commandArguments: "", schtasks: () => ({ status: 1, stdout: "", stderr: "" }) },
        openPath: () => {}
      }
    });
    base = `http://127.0.0.1:${ui.port}`;
    const login = await fetch(`${base}/?k=${ui.token}`, { redirect: "manual" });
    assert.equal(login.status, 302);
    cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  });
  after(async () => { await ui.close(); });

  const get = (path: string, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { headers: { cookie, ...headers } });
  const post = (path: string, body: unknown, headers: Record<string, string> = { "x-tarhely": "1" }) =>
    fetch(`${base}${path}`, { method: "POST", headers: { cookie, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  it("belépőkulcs és süti nélkül nem enged be", async () => {
    assert.equal((await fetch(`${base}/api/allapot`)).status, 403);
    assert.equal((await fetch(`${base}/?k=rossz`, { redirect: "manual" })).status, 403);
    assert.equal((await get("/api/allapot", { cookie: "tarhely_felulet=rossz" })).status, 403);
  });

  it("idegen Host fejlécet (DNS-rebinding) elutasít", async () => {
    const status = await new Promise<number>((resolveStatus, reject) => {
      const request = httpRequest({ host: "127.0.0.1", port: ui.port, path: "/api/allapot", headers: { cookie, host: "evil.example" } }, (response) => {
        response.resume();
        resolveStatus(response.statusCode ?? 0);
      });
      request.on("error", reject);
      request.end();
    });
    assert.equal(status, 403);
  });

  it("módosító kérés külön fejlécet kér", async () => {
    assert.equal((await post("/api/muvelet", { nev: "proba" }, {})).status, 403);
  });

  it("kiszolgálja az oldalt", async () => {
    const page = await get("/");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Tárhely-figyelő/u);
    assert.equal((await get("/app.js")).status, 200);
    assert.equal((await get("/nincs")).status, 404);
  });

  it("az állapot jelzi, mi hiányzik", async () => {
    const status = (await (await get("/api/allapot")).json()) as { kesz: boolean; ellenorzes: { id: string; ok: boolean }[]; statisztika: { osszes: number } };
    assert.equal(status.kesz, true);
    assert.equal(status.statisztika.osszes, 0);
    assert.equal(status.ellenorzes.find((check) => check.id === "ugyfelkapu")?.ok, false);
    assert.equal(status.ellenorzes.find((check) => check.id === "chromium")?.ok, true);
  });

  it("hibás beállítást nem ment, jót igen", async () => {
    const original = ((await (await get("/api/beallitasok")).json()) as { adatok: Record<string, unknown> }).adatok;
    const bad = await post("/api/beallitasok", { adatok: { ...original, alapertelmezett_cimzett: ["nem-email"] } });
    assert.equal(bad.status, 422);
    assert.match(((await bad.json()) as { hiba: string }).hiba, /e-mail/u);
    assert.match(readFileSync(join(dir, "beallitasok.json"), "utf8"), /iroda@example\.com/u);
    const good = await post("/api/beallitasok", { adatok: { ...original, alapertelmezett_cimzett: ["uj@example.com"], kezdo_datum: "2026-10-01" } });
    assert.equal(good.status, 200);
    assert.match(readFileSync(join(dir, "beallitasok.json"), "utf8"), /uj@example\.com/u);
  });

  it("a titkokat elmenti, de sosem küldi vissza", async () => {
    assert.equal((await post("/api/titkok", { ugyfelkapu: { felhasznalo: "kovacs", jelszo: "titok123" } })).status, 422);
    assert.equal((await post("/api/titkok", { ugyfelkapu: { felhasznalo: "kovacs", jelszo: "titok123", totp: "nem-kulcs" } })).status, 422);
    assert.equal((await post("/api/titkok", { ugyfelkapu: { felhasznalo: "kovacs", jelszo: "titok123", totp: "jbsw y3dp ehpk 3pxp" }, smtpJelszo: "levelez-jelszo" })).status, 200);
    assert.deepEqual(stored, { username: "kovacs", password: "titok123", totpSeed: "JBSWY3DPEHPK3PXP" });
    assert.equal(smtpSecret, "levelez-jelszo");
    const info = await (await get("/api/titkok")).text();
    assert.doesNotMatch(info, /titok123|JBSWY3DP|levelez-jelszo/u);
    const status = await (await get("/api/allapot")).text();
    assert.doesNotMatch(status, /titok123|JBSWY3DP|levelez-jelszo/u);
    // csak az SMTP-jelszó cseréje nem bántja az Ügyfélkapu+ adatait
    await post("/api/titkok", { smtpJelszo: "masik" });
    assert.equal(stored?.password, "titok123");
  });

  it("éles futást csak megerősítéssel indít, a dátumot ellenőrzi", async () => {
    assert.equal((await post("/api/muvelet", { nev: "futtatas" })).status, 422);
    assert.equal((await post("/api/muvelet", { nev: "proba", since: "tegnap" })).status, 400);
    assert.equal((await post("/api/muvelet", { nev: "teszt-email", cim: "rossz" })).status, 400);
    assert.equal((await post("/api/muvelet", { nev: "torles" })).status, 400);
    assert.equal(started.length, 0);
    assert.equal((await post("/api/muvelet", { nev: "futtatas", megerosites: true, since: "2026-10-01" })).status, 200);
    assert.equal((await post("/api/muvelet", { nev: "proba" })).status, 200);
    assert.deepEqual(started.map((request) => request.name), ["futtatas", "proba"]);
    assert.equal(started[0]?.since, "2026-10-01");
  });

  it("a megnyitható célok listája zárt", async () => {
    assert.equal((await post("/api/megnyitas", { mit: "C:/Windows/system32/calc.exe" })).status, 400);
  });

  it("ütemezés nem Windowson nem támogatott", async () => {
    const view = (await (await get("/api/utemezes")).json()) as { supported: boolean };
    assert.equal(view.supported, false);
    assert.equal((await post("/api/utemezes", { idopontok: ["08:00"] })).status, 500);
  });

  it("a céglistát és a napló nélküli állapotot kezeli", async () => {
    const companies = (await (await get("/api/cegek")).json()) as { cegek: unknown[] };
    assert.ok(Array.isArray(companies.cegek));
    const log = (await (await get("/api/naplo")).json()) as { sorok: unknown[] };
    assert.deepEqual(log.sorok, []);
    assert.equal((await get("/api/naplo?honap=../../x")).status, 400);
    assert.equal(((await (await get("/api/levelek")).json()) as { sorok: unknown[] }).sorok.length, 0);
  });
});
