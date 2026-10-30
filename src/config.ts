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
  readonly from: string;
}

export interface Config {
  readonly baseDir: string;
  readonly companyListPath: string;
  readonly logPath: string;
  readonly dataDir: string;
  readonly startDate: string | null;
  readonly skipMailboxes: readonly string[];
  readonly skipTypes: readonly string[];
  readonly defaultRecipients: readonly string[];
  readonly bcc: readonly string[];
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
    from: str(smtpJson, "felado", user)
  };
  if (smtp.from === "") {
    fail("az „smtp.felado” mező kötelező, ha nincs „smtp.felhasznalo”.");
  }

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

  return {
    baseDir,
    companyListPath: at(str(root, "ceglista", "ceglista.xlsx")),
    logPath: at(str(root, "naplo", "letoltesek.xlsx")),
    dataDir: at(str(root, "adatmappa", "adat")),
    startDate: startDate === "" ? null : startDate,
    skipMailboxes: list(root, "kihagyott_postafiokok"),
    skipTypes: list(root, "kihagyott_tipusok"),
    defaultRecipients,
    bcc: emails(root, "titkos_masolat"),
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
