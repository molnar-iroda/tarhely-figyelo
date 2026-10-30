import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import ExcelJS from "exceljs";

import { cellText } from "../src/companies.ts";
import type { MailSender, OutgoingMail } from "../src/mailer.ts";
import { processLetters } from "../src/process.ts";
import type { State } from "../src/state.ts";
import { COMPANIES, tempDir, testConfig, writeTarhely } from "./helpers.ts";

function recordingSender(failFor: Set<string>): MailSender & { sent: OutgoingMail[] } {
  const sent: OutgoingMail[] = [];
  return {
    sent,
    async send(mail) {
      const to = mail.to.join(",");
      if (failFor.has(to)) {
        failFor.delete(to);
        throw new Error("421 a szerver átmenetileg nem érhető el");
      }
      sent.push(mail);
    }
  };
}

describe("feldolgozás", () => {
  it("céghez rendel, küld, naplóz; a hibás küldést a következő futás pótolja", async () => {
    const base = tempDir("feldolgozas");
    const config = testConfig(base);
    const tarhelyDir = join(config.dataDir, "tarhely");
    writeTarhely(tarhelyDir, [
      { eid: "A1", mailbox: "12345678 (Példa Kft)", desc: "Felhívás bevallás pótlására", fixture: "felhivas.pdf" },
      // az iroda saját tárhelye: a cég a dokumentum szövegéből derül ki
      { eid: "B2", mailbox: "11111111 (Iroda Kft)", desc: "Tájékoztatás", fixture: "tajekoztatas.pdf" },
      { eid: "C3", mailbox: "99999999 (Ismeretlen Zrt)", desc: "Végzés", text: "8 napon belül nyilatkozzon" },
      { eid: "D4", mailbox: "12345678 (Példa Kft)", desc: "Feladási igazolás", type: "Feladási igazolás", text: "" }
    ]);
    const statePath = join(config.dataDir, "allapot.json");
    const sender = recordingSender(new Set(["bela@example.com"]));
    const logs: string[] = [];
    const options = {
      config,
      companies: COMPANIES,
      tarhelyDir,
      statePath,
      logPath: config.logPath,
      sender,
      proba: false,
      log: (message: string) => logs.push(message),
      now: () => new Date("2026-10-27T08:16:00.000Z")
    };

    const first = await processLetters(options);
    assert.equal(first.newLetters, 4);
    assert.equal(first.emailed, 2);
    assert.equal(first.unmatched, 1);
    assert.equal(first.skipped, 1);
    assert.equal(first.emailFailures.length, 1);
    assert.equal(first.logError, null);

    const [pelda, unmatched] = sender.sent;
    assert.deepEqual(pelda?.to, ["anna@example.com"]);
    assert.match(pelda?.subject ?? "", /^Tárhely – Példa Kft\. – Felhívás bevallás pótlására \(határidő: 2026-11-11\)$/);
    assert.deepEqual(pelda?.attachments.map((item) => item.filename), ["felhivas.pdf"]);
    assert.match(pelda?.text ?? "", /Felelős könyvelő:\s+Minta Anna/);
    assert.match(pelda?.text ?? "", /Határidő:\s+2026-11-11 \(számított, ellenőrizendő\)/);
    assert.match(pelda?.text ?? "", /\| 2026-11-20: „/);

    assert.deepEqual(unmatched?.to, ["iroda@example.com"]);
    assert.match(unmatched?.subject ?? "", /^\[NINCS FELELŐS\] Tárhely – 99999999 \(Ismeretlen Zrt\) – Végzés \(határidő: 2026-11-04\)/);

    const state = JSON.parse(readFileSync(statePath, "utf8")) as State;
    assert.equal(state.letters.B2?.company, "Másik Bt.");
    assert.equal(state.letters.B2?.matchedBy, "tartalom");
    assert.equal(state.letters.B2?.emailStatus, "hiba");
    assert.equal(state.letters.D4?.emailStatus, "kihagyva");

    // Második futás: nincs új levél, a sikertelen küldés megismétlődik.
    const second = await processLetters(options);
    assert.equal(second.newLetters, 0);
    assert.equal(second.emailed, 1);
    assert.deepEqual(second.emailFailures, []);
    assert.deepEqual(sender.sent.at(-1)?.to, ["bela@example.com"]);

    // Harmadik futás: semmi dolga, a korábbi hibát sem jelzi újra.
    const third = await processLetters(options);
    assert.equal(third.emailed, 0);
    assert.deepEqual(third.emailFailures, []);
    assert.equal(sender.sent.length, 3);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(config.logPath);
    const sheet = workbook.getWorksheet("Letöltések");
    assert.ok(sheet);
    assert.equal(sheet.rowCount, 5);
    const rows = [2, 3, 4, 5].map((number) => sheet.getRow(number));
    const byEid = new Map(rows.map((row) => [cellText(row.getCell(11).value), row]));
    assert.equal(cellText(byEid.get("A1")?.getCell(2).value), "Minta Anna");
    assert.equal(cellText(byEid.get("B2")?.getCell(2).value), "Teszt Béla");
    assert.match(cellText(byEid.get("B2")?.getCell(13).value), /^Elküldve/);
    assert.match(cellText(byEid.get("D4")?.getCell(13).value), /^Nem küldve: kihagyott típus/);
    assert.equal(cellText(byEid.get("C3")?.getCell(3).value), "99999999 (Ismeretlen Zrt)");
  });

  it("csak lejárt, jelzett dátumot tartalmazó levél: deadlineExpired=true, deadline=null", async () => {
    const base = tempDir("feldolgozas");
    const config = testConfig(base);
    const tarhelyDir = join(config.dataDir, "tarhely");
    writeTarhely(tarhelyDir, [
      { eid: "A1", mailbox: "12345678 (Példa Kft)", desc: "Levél", text: "A bevallás határideje 2026. október 1. volt." }
    ]);
    const statePath = join(config.dataDir, "allapot.json");
    const logs: string[] = [];
    const options = {
      config,
      companies: COMPANIES,
      tarhelyDir,
      statePath,
      logPath: config.logPath,
      sender: recordingSender(new Set()),
      proba: false,
      log: (message: string) => logs.push(message),
      now: () => new Date("2026-10-27T08:16:00.000Z")
    };

    const result = await processLetters(options);
    assert.equal(result.newLetters, 1);
    assert.equal(result.emailed, 1);

    const state = JSON.parse(readFileSync(statePath, "utf8")) as State;
    assert.equal(state.letters.A1?.deadline, null);
    assert.equal(state.letters.A1?.deadlineExpired, true);
    assert.match(logs[0] ?? "", /LEJÁRT hivatkozott határidő!/);
  });

  it("munkaszüneti napra közölt határidő: a rekord a következő munkanapot is tárolja", async () => {
    const base = tempDir("feldolgozas");
    const config = testConfig(base);
    const tarhelyDir = join(config.dataDir, "tarhely");
    writeTarhely(tarhelyDir, [
      { eid: "A1", mailbox: "12345678 (Példa Kft)", desc: "Levél", text: "Benyújtási határidő: 2026. november 21." },
      { eid: "B2", mailbox: "12345678 (Példa Kft)", desc: "Másik", text: "Benyújtási határidő: 2026. november 20." }
    ]);
    const statePath = join(config.dataDir, "allapot.json");
    await processLetters({
      config,
      companies: COMPANIES,
      tarhelyDir,
      statePath,
      logPath: config.logPath,
      sender: recordingSender(new Set()),
      proba: false,
      log: () => {},
      now: () => new Date("2026-10-27T08:16:00.000Z")
    });
    const state = JSON.parse(readFileSync(statePath, "utf8")) as State;
    assert.equal(state.letters.A1?.deadline, "2026-11-21");
    assert.equal(state.letters.A1?.deadlineNextWorkday, "2026-11-23");
    assert.equal(state.letters.B2?.deadlineNextWorkday, undefined);
  });

  it("szkennelt irat: OCR-rel talált határidő, a megjegyzés figyelmeztet", async () => {
    const base = tempDir("feldolgozas");
    const config = testConfig(base);
    const tarhelyDir = join(config.dataDir, "tarhely");
    writeTarhely(tarhelyDir, [
      { eid: "A1", mailbox: "12345678 (Példa Kft)", desc: "Szkennelt felhívás", fixture: "szkennelt.pdf" }
    ]);
    const statePath = join(config.dataDir, "allapot.json");
    await processLetters({
      config,
      companies: COMPANIES,
      tarhelyDir,
      statePath,
      logPath: config.logPath,
      sender: recordingSender(new Set()),
      proba: false,
      log: () => {},
      now: () => new Date("2026-10-27T08:16:00.000Z")
    });
    const state = JSON.parse(readFileSync(statePath, "utf8")) as State;
    assert.equal(state.letters.A1?.deadline, "2026-11-20");
    assert.match(state.letters.A1?.deadlineNote ?? "", /^\(Szkennelt irat, OCR-rel felismert szöveg/u);
  });

  it("a napló zárolása nem veszít sort: a következő futás beírja", async () => {
    const base = tempDir("feldolgozas");
    const config = testConfig(base);
    const tarhelyDir = join(config.dataDir, "tarhely");
    writeTarhely(tarhelyDir, [
      { eid: "A1", mailbox: "12345678 (Példa Kft)", desc: "Felhívás", text: "" }
    ]);
    const { writeFileSync, rmSync } = await import("node:fs");
    const lockFile = join(base, "~$letoltesek.xlsx");
    writeFileSync(lockFile, "");
    const options = {
      config,
      companies: COMPANIES,
      tarhelyDir,
      statePath: join(config.dataDir, "allapot.json"),
      logPath: config.logPath,
      sender: recordingSender(new Set()),
      proba: false,
      log: () => {}
    };
    const locked = await processLetters(options);
    assert.match(locked.logError ?? "", /nyitva van/);

    rmSync(lockFile);
    const unlocked = await processLetters(options);
    assert.equal(unlocked.logError, null);
    assert.equal(unlocked.emailed, 0);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(config.logPath);
    assert.equal(workbook.getWorksheet("Letöltések")?.rowCount, 2);
  });
});

describe("tartósan sikertelen küldés", () => {
  it("ötödik próbálkozás után feladja, és többé nem jelzi", async () => {
    const base = tempDir("feldolgozas");
    const config = testConfig(base);
    const tarhelyDir = join(config.dataDir, "tarhely");
    writeTarhely(tarhelyDir, [{ eid: "A1", mailbox: "12345678 (Példa Kft)", desc: "Felhívás", text: "" }]);
    let attempts = 0;
    const options = {
      config,
      companies: COMPANIES,
      tarhelyDir,
      statePath: join(config.dataDir, "allapot.json"),
      logPath: config.logPath,
      sender: {
        async send() {
          attempts += 1;
          throw new Error("535 hitelesítési hiba");
        }
      },
      proba: false,
      log: () => {}
    };
    const reports = [];
    for (let run = 0; run < 7; run += 1) {
      reports.push(await processLetters(options));
    }
    assert.equal(attempts, 5);
    assert.match(reports[4]?.emailFailures[0] ?? "", /kézzel kell továbbítani/);
    assert.deepEqual(reports[5]?.emailFailures, []);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(config.logPath);
    assert.match(
      cellText(workbook.getWorksheet("Letöltések")?.getRow(2).getCell(13).value),
      /^HIBA \(5\. próbálkozás\): 535/
    );
  });
});
