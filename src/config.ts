// A beallitasok.json betöltése és ellenőrzése. A relatív útvonalak a
// beállításfájl mappájához képest értendők, így az ütemezett futás a munka-
// mappától függetlenül ugyanazokat a fájlokat használja.

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { parseEmails } from "./companies.ts";
import { hungarianHolidays, isIsoDate, isWeekend } from "./dates.ts";

export const CONFIG_FILE = "beallitasok.json";

/** A telepített változat a felhasználói adatmappából dolgozik (TARHELY_BEALLITASOK), fejlesztéskor a munkamappából. */
export function defaultConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.TARHELY_BEALLITASOK;
  return fromEnv !== undefined && fromEnv !== "" ? fromEnv : CONFIG_FILE;
}

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  /** Igaz: SSL-kapcsolat azonnal (465-ös port); hamis: STARTTLS (587). */
  readonly secure: boolean;
  /** Üres: hitelesítés nélküli belső továbbító. */
  readonly user: string;
  /** A levelek „From” fejléce, mindig címmel: `Név <cím>` vagy `cím`. */
  readonly from: string;
}

/** Postafiókonkénti beállítás a kezelőfelület „Postafiókok” lapjáról. */
export type MailboxMode = "letoltes" | "ertesites" | "kihagy";

export interface MailboxRule {
  /** A postafiók neve, ahogy a portál mutatja (a törzsszám alapján azonosítjuk). */
  readonly mailbox: string;
  readonly mode: MailboxMode;
  /** Letöltésnél: ha meg van adva, a céglista helyett ide megy a levél; értesítésnél kötelező. */
  readonly recipients: readonly string[];
}

export interface Config {
  readonly baseDir: string;
  readonly companyListPath: string;
  readonly logPath: string;
  readonly dataDir: string;
  readonly startDate: string | null;
  readonly skipMailboxes: readonly string[];
  readonly skipTypes: readonly string[];
  /** Ezeket letölti (megnyitja), de nem küldi tovább senkinek. */
  readonly downloadOnlyTypes: readonly string[];
  readonly mailboxRules: readonly MailboxRule[];
  readonly defaultRecipients: readonly string[];
  /** A ténylegesen használt titkos másolat (üres, ha a kapcsoló ki van kapcsolva). */
  readonly bcc: readonly string[];
  readonly bccEnabled: boolean;
  readonly errorRecipients: readonly string[];
  readonly maxAttachmentMb: number;
  readonly maxLettersPerRun: number;
  readonly extraHolidays: readonly string[];
  readonly extraWorkdays: readonly string[];
  readonly smtp: SmtpConfig;
}

type Json = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`Hibás beállítás (${CONFIG_FILE}): ${message}`);
}

function str(json: Json, key: string, fallback?: string): string {
  const value = json[key];
  if (value === undefined || value === null) {
    if (fallback === undefined) {
      fail(`hiányzik a(z) „${key}” mező.`);
    }
    return fallback;
  }
  if (typeof value !== "string") {
    fail(`a(z) „${key}” mezőnek szövegnek kell lennie.`);
  }
  return value.trim();
}

function num(json: Json, key: string, fallback: number): number {
  const value = json[key];
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail(`a(z) „${key}” mezőnek pozitív számnak kell lennie.`);
  }
  return value;
}

function list(json: Json, key: string): string[] {
  const value = json[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`a(z) „${key}” mező szöveg vagy szövegek listája lehet.`);
  }
  return value.map((item: string) => item.trim()).filter((item) => item !== "");
}

function emails(json: Json, key: string): string[] {
  const values = list(json, key).flatMap(parseEmails);
  for (const value of values) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      fail(`érvénytelen e-mail cím a(z) „${key}” mezőben: ${value}`);
    }
  }
  return values;
}

const MAILBOX_MODES: readonly MailboxMode[] = ["letoltes", "ertesites", "kihagy"];

function mailboxRules(json: Json): MailboxRule[] {
  const value = json.postafiok_szabalyok;
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail("a „postafiok_szabalyok” mező lista legyen.");
  }
  return value.map((item: unknown, index: number) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      fail(`a „postafiok_szabalyok” ${index + 1}. eleme nem megfelelő.`);
    }
    const rule = item as Json;
    const mailbox = str(rule, "postafiok");
    if (mailbox === "") {
      fail(`a „postafiok_szabalyok” ${index + 1}. eleméből hiányzik a postafiók neve.`);
    }
    const mode = str(rule, "mod", "letoltes") as MailboxMode;
    if (!MAILBOX_MODES.includes(mode)) {
      fail(`a „postafiok_szabalyok” ${index + 1}. elemének módja ismeretlen: ${mode}`);
    }
    const recipients = emails(rule, "cimzett");
    if (mode === "ertesites" && recipients.length === 0) {
      fail(`„${mailbox}”: csak értesítésnél meg kell adni, kinek menjen az értesítés.`);
    }
    return { mailbox, mode, recipients };
  });
}

const ADDRESS = /[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+/;

/**
 * A feladó mindig címmel: ha a „felado” csak egy név (pl. „Tárhely-figyelő”),
 * a cím az SMTP-felhasználó lesz. Cím nélküli From fejlécet a levélkészítő
 * kihagy, és a levél feladó nélkül érkezik.
 */
export function senderAddress(felado: string, user: string): string {
  if (ADDRESS.test(felado)) {
    return felado;
  }
  if (!ADDRESS.test(user)) {
    fail("az „smtp.felado” mezőben e-mail cím is kell legyen, pl. „Tárhely-figyelő <tarhely@example.com>”.");
  }
  const name = felado.replace(/["<>]/g, "").trim();
  return name === "" ? user : `"${name}" <${user}>`;
}

export function parseConfig(raw: string, path: string): Config {
  let json: unknown;
  try {
    // A Jegyzettömb UTF-8 BOM-mal menthet; a JSON.parse azt nem viseli el.
    json = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (error) {
    fail(`nem érvényes JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    fail("a fájl tartalma egy { … } objektum kell legyen.");
  }
  const root = json as Json;
  const baseDir = dirname(resolve(path));
  const at = (value: string) => (isAbsolute(value) ? value : resolve(baseDir, value));

  const smtpRaw = root.smtp;
  if (typeof smtpRaw !== "object" || smtpRaw === null || Array.isArray(smtpRaw)) {
    fail("hiányzik az „smtp” rész.");
  }
  const smtpJson = smtpRaw as Json;
  const user = str(smtpJson, "felhasznalo", "");
  const smtp: SmtpConfig = {
    host: str(smtpJson, "kiszolgalo"),
    port: num(smtpJson, "port", 587),
    secure: smtpJson.ssl === true,
    user,
    from: senderAddress(str(smtpJson, "felado", user), user)
  };

  const startDate = root.kezdo_datum === null ? null : str(root, "kezdo_datum", "");
  if (startDate !== null && startDate !== "" && !isIsoDate(startDate)) {
    fail(`a „kezdo_datum” ÉÉÉÉ-HH-NN alakú legyen (most: ${startDate}).`);
  }
  const extraHolidays = list(root, "extra_munkaszuneti_napok");
  for (const day of extraHolidays) {
    if (!isIsoDate(day)) {
      fail(`az „extra_munkaszuneti_napok” elemei ÉÉÉÉ-HH-NN alakúak legyenek (most: ${day}).`);
    }
  }
  const extraWorkdays = list(root, "extra_munkanapok");
  for (const day of extraWorkdays) {
    if (!isIsoDate(day)) {
      fail(`az „extra_munkanapok” elemei ÉÉÉÉ-HH-NN alakúak legyenek (most: ${day}).`);
    }
    if (!isWeekend(day)) {
      fail(`az „extra_munkanapok” csak hétvégi nap lehet (most: ${day}).`);
    }
    if (hungarianHolidays(Number(day.slice(0, 4))).includes(day)) {
      fail(`az „extra_munkanapok” nem lehet törvényi ünnep (${day}).`);
    }
    if (extraHolidays.includes(day)) {
      fail(`az „extra_munkanapok” nem szerepelhet az „extra_munkaszuneti_napok” között (${day}).`);
    }
  }

  const defaultRecipients = emails(root, "alapertelmezett_cimzett");
  if (defaultRecipients.length === 0) {
    fail("az „alapertelmezett_cimzett” kötelező: ide mennek a céghez nem rendelhető levelek.");
  }
  const errorRecipients = emails(root, "hiba_ertesites");
  const bccEnabled = root.titkos_masolat_be !== false;

  return {
    baseDir,
    companyListPath: at(str(root, "ceglista", "ceglista.xlsx")),
    logPath: at(str(root, "naplo", "letoltesek.xlsx")),
    dataDir: at(str(root, "adatmappa", "adat")),
    startDate: startDate === "" ? null : startDate,
    skipMailboxes: list(root, "kihagyott_postafiokok"),
    skipTypes: list(root, "kihagyott_tipusok"),
    downloadOnlyTypes: list(root, "csak_letoltes_tipusok"),
    mailboxRules: mailboxRules(root),
    defaultRecipients,
    bcc: bccEnabled ? emails(root, "titkos_masolat") : [],
    bccEnabled,
    errorRecipients: errorRecipients.length > 0 ? errorRecipients : defaultRecipients,
    maxAttachmentMb: num(root, "max_csatolmany_mb", 20),
    maxLettersPerRun: num(root, "max_level_futasonkent", 200),
    extraHolidays,
    extraWorkdays,
    smtp
  };
}

export function loadConfig(path: string): Config {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `Nem találom a beállításfájlt: ${resolve(path)}. Nyisd meg a kezelőfelületet (asztali ikon), vagy futtasd: npm run beallitas`
    );
  }
  return parseConfig(raw, path);
}
