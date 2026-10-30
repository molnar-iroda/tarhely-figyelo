// Közös tesztsegédek. Minden cég, név és szám kitalált.

import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ExcelJS from "exceljs";

import type { Company } from "../src/companies.ts";
import type { Config } from "../src/config.ts";
import type { LetterRecord } from "../src/state.ts";
import type { IndexEntry } from "../src/vendor/tarhely-cli/store/index.ts";

export const FIXTURES = new URL("./fixtures/", import.meta.url);

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

export const COMPANIES: readonly Company[] = [
  {
    name: "Példa Kft.",
    taxNumber: "12345678-2-41",
    torzsszam: "12345678",
    accountant: "Minta Anna",
    emails: ["anna@example.com"],
    row: 2
  },
  {
    name: "Másik Bt.",
    taxNumber: "87654321-1-13",
    torzsszam: "87654321",
    accountant: "Teszt Béla",
    emails: ["bela@example.com"],
    row: 3
  }
];

export async function writeCompanyList(path: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cégek");
  sheet.addRow(["Cég neve", "Adószám", "Könyvelő", "Könyvelő e-mail"]);
  for (const company of COMPANIES) {
    sheet.addRow([company.name, company.taxNumber, company.accountant, company.emails.join("; ")]);
  }
  await workbook.xlsx.writeFile(path);
}

export function testConfig(baseDir: string, overrides: Partial<Config> = {}): Config {
  return {
    baseDir,
    companyListPath: join(baseDir, "ceglista.xlsx"),
    logPath: join(baseDir, "letoltesek.xlsx"),
    dataDir: join(baseDir, "adat"),
    startDate: null,
    skipMailboxes: ["Értesítési tárhely"],
    skipTypes: ["Feladási igazolás"],
    defaultRecipients: ["iroda@example.com"],
    bcc: [],
    errorRecipients: ["iroda@example.com"],
    maxAttachmentMb: 20,
    maxLettersPerRun: 200,
    extraHolidays: [],
    extraWorkdays: [],
    smtp: { host: "127.0.0.1", port: 2525, secure: false, user: "", from: "tarhely@example.com" },
    ...overrides
  };
}

interface FakeLetter {
  readonly eid: string;
  readonly mailbox: string;
  readonly desc: string;
  readonly type?: string;
  readonly fixture?: string;
  readonly text?: string;
}

/**
 * Egy tarhely-cli által letöltött mappa utánzata: levelenként mappa a fájllal,
 * és az index.jsonl, pont úgy, ahogy a letöltő hagyja.
 */
export function writeTarhely(tarhelyDir: string, letters: readonly FakeLetter[]): IndexEntry[] {
  mkdirSync(tarhelyDir, { recursive: true });
  const entries = letters.map((letter, index): IndexEntry => {
    const dir = join("postafiok", `2026-10-27_${letter.eid}`);
    mkdirSync(join(tarhelyDir, dir), { recursive: true });
    let file: string;
    if (letter.fixture !== undefined) {
      file = letter.fixture;
      copyFileSync(new URL(letter.fixture, FIXTURES), join(tarhelyDir, dir, file));
    } else {
      file = "uzenet.txt";
      writeFileSync(join(tarhelyDir, dir, file), letter.text ?? "");
    }
    return {
      eid: letter.eid,
      mailbox: letter.mailbox,
      receivedOn: "2026-10-27",
      receivedAt: "2026-10-27 08:0" + String(index),
      sender: "Minta Hivatal",
      type: letter.type ?? "Hivatalos irat",
      desc: letter.desc,
      referencedRegistrationNumber: null,
      note: null,
      dir,
      file,
      extracted: [],
      // 09:15 budapesti idő
      downloadedAt: "2026-10-27T08:15:00.000Z"
    };
  });
  writeFileSync(
    join(tarhelyDir, "index.jsonl"),
    entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n"
  );
  return entries;
}

export function record(overrides: Partial<LetterRecord> = {}): LetterRecord {
  return {
    eid: "A1",
    mailbox: "12345678 (Példa Kft)",
    company: "Példa Kft.",
    taxNumber: "12345678-2-41",
    accountant: "Minta Anna",
    matchedBy: "postafiok",
    recipients: ["anna@example.com"],
    subject: "Felhívás",
    type: "Hivatalos irat",
    sender: "Minta Hivatal",
    receivedAt: "2026-10-27 08:00",
    downloadedAt: "2026-10-27T08:15:00.000Z",
    deadline: "2026-11-20",
    deadlineComputed: false,
    deadlineNote: "2026-11-20: „határideje: 2026. november 20.”",
    dir: "postafiok/2026-10-27_A1",
    files: ["felhivas.pdf"],
    skipReason: null,
    emailStatus: "elkuldve",
    emailError: null,
    emailAttempts: 1,
    emailedAt: "2026-10-27T08:16:00.000Z",
    logSynced: false,
    ...overrides
  };
}
