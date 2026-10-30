// A letöltött levelek feldolgozása: céghez és könyvelőhöz rendelés,
// határidő-keresés, e-mail, napló. A tárhely-portálhoz nem nyúl, csak a már
// letöltött mappából dolgozik, ezért külön is futtatható (pl. ha egy e-mail
// elküldése korábban nem sikerült).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Company } from "./companies.ts";
import { matchByContent, matchByMailbox, stripAccents } from "./companies.ts";
import type { Config } from "./config.ts";
import { findDeadline } from "./deadline.ts";
import { LogLockedError, upsertLogRows } from "./excel-log.ts";
import { textOfFiles } from "./letter-text.ts";
import type { MailSender } from "./mailer.ts";
import { composeLetterMail } from "./mailer.ts";
import type { LetterRecord, State } from "./state.ts";
import { loadState, saveState } from "./state.ts";
import { localDate } from "./time.ts";
import type { IndexEntry } from "./vendor/tarhely-cli/store/index.ts";

/** Ennyi sikertelen küldés után már nem próbálkozunk, csak jelezzük. */
export const MAX_EMAIL_ATTEMPTS = 5;

export interface ProcessOptions {
  readonly config: Config;
  readonly companies: readonly Company[];
  /** A tárhely-letöltések mappája (benne az index.jsonl). */
  readonly tarhelyDir: string;
  readonly statePath: string;
  readonly logPath: string;
  readonly sender: MailSender;
  readonly proba: boolean;
  readonly log: (message: string) => void;
  readonly now?: () => Date;
}

export interface ProcessReport {
  readonly newLetters: number;
  readonly emailed: number;
  /** Az új levelek közül a céghez nem rendelhetők és a szűrő miatt kihagyottak. */
  readonly unmatched: number;
  readonly skipped: number;
  /** Az ebben a futásban sikertelen küldések. */
  readonly emailFailures: readonly string[];
  readonly logError: string | null;
}

/** Az index.jsonl beolvasása; a sérült sort kihagyja, nem áll meg miatta. */
export function readIndexFile(tarhelyDir: string, log: (message: string) => void): IndexEntry[] {
  const path = join(tarhelyDir, "index.jsonl");
  if (!existsSync(path)) {
    return [];
  }
  const entries: IndexEntry[] = [];
  for (const [index, line] of readFileSync(path, "utf8").split("\n").entries()) {
    if (line.trim() === "") {
      continue;
    }
    try {
      entries.push(JSON.parse(line) as IndexEntry);
    } catch {
      log(`Az index.jsonl ${index + 1}. sora sérült, kihagyom.`);
    }
  }
  return entries;
}

function fold(value: string): string {
  return stripAccents(value).toLowerCase();
}

const OCR_NOTE = "(Szkennelt irat, OCR-rel felismert szöveg – a dátumok tévesek lehetnek, ellenőrizd az eredetit!) ";

const OCR_INCOMPLETE_NOTE =
  "(Szkennelt oldal OCR-je sikertelen vagy kimaradt – a szöveg hiányos, a határidőt ellenőrizd az eredetin!) ";

async function buildRecord(entry: IndexEntry, options: ProcessOptions): Promise<LetterRecord> {
  const { config, companies, log } = options;
  const letterDir = join(options.tarhelyDir, entry.dir);
  const files = entry.extracted.length > 0 ? [...entry.extracted] : [entry.file];
  const { text, errors, ocr, ocrIncomplete } = await textOfFiles(files.map((file) => join(letterDir, file)));
  for (const error of errors) {
    log(`Nem olvasható szöveg (${entry.eid}): ${error}`);
  }
  const fullText = [entry.desc, entry.type, entry.note ?? "", text].join("\n");

  let company = matchByMailbox(entry.mailbox, companies);
  let matchedBy: LetterRecord["matchedBy"] = company === null ? null : "postafiok";
  if (company === null) {
    company = matchByContent(fullText, companies);
    matchedBy = company === null ? null : "tartalom";
  }

  const skipPattern = config.skipTypes.find((pattern) =>
    fold(`${entry.type} ${entry.desc}`).includes(fold(pattern))
  );
  const downloadedAt = new Date(entry.downloadedAt);
  const deadline = findDeadline(
    fullText,
    localDate(downloadedAt),
    config.extraHolidays,
    config.extraWorkdays
  );

  return {
    eid: entry.eid,
    mailbox: entry.mailbox,
    company: company?.name ?? "",
    taxNumber: company?.taxNumber ?? "",
    accountant: company?.accountant ?? "",
    matchedBy,
    recipients: company === null ? [...config.defaultRecipients] : [...company.emails],
    subject: entry.desc || entry.type,
    type: entry.type,
    sender: entry.sender,
    receivedAt: entry.receivedAt,
    downloadedAt: entry.downloadedAt,
    deadline: deadline.date,
    deadlineComputed: deadline.computed,
    deadlineNote: `${ocrIncomplete ? OCR_INCOMPLETE_NOTE : ""}${ocr ? OCR_NOTE : ""}${deadline.note}`,
    deadlineExpired: deadline.expired.length > 0,
    ...(deadline.nextWorkday === undefined ? {} : { deadlineNextWorkday: deadline.nextWorkday }),
    ...(ocr || ocrIncomplete ? { deadlineOcr: true } : {}),
    dir: entry.dir,
    files,
    skipReason: skipPattern === undefined ? null : `kihagyott típus („${skipPattern}”)`,
    emailStatus: skipPattern === undefined ? "fuggo" : "kihagyva",
    emailError: null,
    emailAttempts: 0,
    emailedAt: null,
    logSynced: false
  };
}

function needsEmail(record: LetterRecord): boolean {
  return (
    (record.emailStatus === "fuggo" || record.emailStatus === "hiba") &&
    record.emailAttempts < MAX_EMAIL_ATTEMPTS
  );
}

export async function processLetters(options: ProcessOptions): Promise<ProcessReport> {
  const { config, log } = options;
  const now = options.now ?? (() => new Date());
  const state: State = loadState(options.statePath);
  const entries = readIndexFile(options.tarhelyDir, log);

  const fresh: LetterRecord[] = [];
  for (const entry of entries) {
    if (state.letters[entry.eid] !== undefined) {
      continue;
    }
    const record = await buildRecord(entry, options);
    state.letters[entry.eid] = record;
    saveState(options.statePath, state);
    fresh.push(record);
    const target = record.accountant === "" ? "nincs a céglistában" : record.accountant;
    log(
      `Új levél: ${record.company || record.mailbox} – ${record.subject} → ${target}` +
        (record.deadline === null ? "" : `, határidő: ${record.deadline}`) +
        (record.deadlineExpired === true ? ", LEJÁRT hivatkozott határidő!" : "")
    );
  }

  let emailed = 0;
  const emailFailures: string[] = [];
  for (const record of Object.values(state.letters)) {
    if (!needsEmail(record)) {
      continue;
    }
    const mail = composeLetterMail(record, config, options.tarhelyDir);
    try {
      await options.sender.send(mail, config.smtp.from);
      record.emailStatus = options.proba ? "proba" : "elkuldve";
      record.emailError = null;
      record.emailedAt = now().toISOString();
      emailed += 1;
      log(`E-mail ${options.proba ? "(próba, .eml)" : "elküldve"}: ${mail.to.join(", ")} – ${mail.subject}`);
    } catch (error) {
      record.emailStatus = "hiba";
      record.emailError = error instanceof Error ? error.message : String(error);
      const final =
        record.emailAttempts + 1 >= MAX_EMAIL_ATTEMPTS
          ? " – többször nem próbálom, kézzel kell továbbítani"
          : "";
      emailFailures.push(
        `${record.eid} (${record.company || record.mailbox}): ${record.emailError}${final}`
      );
      log(`E-mail HIBA (${record.eid}): ${record.emailError}${final}`);
    }
    record.emailAttempts += 1;
    record.logSynced = false;
    saveState(options.statePath, state);
  }

  let logError: string | null = null;
  const unsynced = Object.values(state.letters).filter((record) => !record.logSynced);
  try {
    await upsertLogRows(options.logPath, unsynced);
    for (const record of unsynced) {
      record.logSynced = true;
    }
    saveState(options.statePath, state);
    if (unsynced.length > 0) {
      log(`Napló frissítve (${unsynced.length} sor): ${options.logPath}`);
    }
  } catch (error) {
    logError = error instanceof Error ? error.message : String(error);
    const retry = error instanceof LogLockedError ? " A következő futás újra megpróbálja." : "";
    log(`A napló nem frissült: ${logError}.${retry}`);
  }

  return {
    newLetters: fresh.length,
    emailed,
    unmatched: fresh.filter((record) => record.accountant === "").length,
    skipped: fresh.filter((record) => record.emailStatus === "kihagyva").length,
    emailFailures,
    logError
  };
}
