// Egy teljes futás: letöltés a portálról, feldolgozás, hibajelzés.
//
// A portál hibája (pl. sikertelen belépés) nem akadályozza, hogy a korábban
// letöltött, még el nem küldött levelek feldolgozása lefusson; a hibáról
// e-mail megy a beállított címre, de ugyanarról legfeljebb 12 óránként egy.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import { loadCompanyList } from "./companies.ts";
import type { Config } from "./config.ts";
import { describeError, setupHint } from "./errors.ts";
import type { MailSender } from "./mailer.ts";
import { composeNotice, fileSender, smtpSender } from "./mailer.ts";
import { processLetters } from "./process.ts";
import { writeRunStatus } from "./run-status.ts";
import type { Log } from "./runlog.ts";
import { smtpPassword } from "./secrets.ts";
import { acquireLock, writeFileAtomic } from "./state.ts";

export interface RunOptions {
  readonly config: Config;
  readonly log: Log;
  readonly proba: boolean;
  /** Csak a már letöltött levelek feldolgozása, belépés nélkül. */
  readonly skipDownload: boolean;
  readonly since: string | null;
  /** Első futásnál: minden levél letöltése, dátumkorlát nélkül. */
  readonly all: boolean;
  readonly headed: boolean;
  readonly debug: boolean;
}

const NOTICE_INTERVAL_MS = 12 * 60 * 60 * 1000;

function withSuffix(path: string, suffix: string): string {
  const extension = extname(path);
  return join(dirname(path), `${basename(path, extension)}${suffix}${extension}`);
}

function createSender(options: RunOptions): MailSender {
  const { config } = options;
  if (options.proba) {
    return fileSender(join(config.dataDir, "proba-emailek"));
  }
  const password = config.smtp.user === "" ? null : smtpPassword();
  if (config.smtp.user !== "" && password === null) {
    throw new Error(`Nincs rögzített SMTP-jelszó. Rögzítsd: ${setupHint()}`);
  }
  return smtpSender(config.smtp, password);
}

async function notifyProblems(
  options: RunOptions,
  sender: MailSender,
  problems: readonly string[]
): Promise<void> {
  const { config, log } = options;
  const path = join(config.dataDir, "hiba-ertesites.json");
  const key = createHash("sha256").update(problems.join("\n")).digest("hex");
  try {
    const last = JSON.parse(readFileSync(path, "utf8")) as { key?: string; at?: string };
    if (last.key === key && Date.now() - Date.parse(last.at ?? "") < NOTICE_INTERVAL_MS) {
      log("Ugyanerről a hibáról 12 órán belül már ment értesítés, most nem küldök újat.");
      return;
    }
  } catch {
    // nincs korábbi értesítés
  }
  const mail = composeNotice(config.errorRecipients, "Tárhely-figyelő: hiba a futás közben", [
    "A tárhely-figyelő futása közben az alábbi hibák történtek:",
    ...problems.map((problem) => `• ${problem}`),
    `Részletek a futásnaplóban: ${join(config.dataDir, "naplo")}`
  ]);
  try {
    await sender.send(mail, config.smtp.from);
    writeFileAtomic(path, JSON.stringify({ key, at: new Date().toISOString() }));
    log(`Hibaértesítés elküldve: ${config.errorRecipients.join(", ")}`);
  } catch (error) {
    log(`A hibaértesítést sem sikerült elküldeni: ${describeError(error)}`);
  }
}

/** @returns a kilépési kód: 0 ha minden rendben, 1 ha volt hiba. */
export async function runOnce(options: RunOptions): Promise<number> {
  const { config, log } = options;
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const release = acquireLock(join(config.dataDir, "futas.lock"));
  const startedAt = new Date().toISOString();
  const mode = options.proba ? "proba" : options.skipDownload ? "feldolgozas" : "futtatas";
  const counts = { newLetters: 0, emailed: 0, unmatched: 0, skipped: 0 };
  const allProblems: string[] = [];
  let exitCode: number | null = null;
  writeRunStatus(config.dataDir, { mode, startedAt, finishedAt: null, exitCode: null, ...counts, problems: [] });
  try {
    const tarhelyDir = join(config.dataDir, "tarhely");
    const problems: string[] = allProblems;

    const { companies, warnings } = await loadCompanyList(config.companyListPath);
    log(`Céglista: ${companies.length} cég (${config.companyListPath}).`);
    for (const warning of warnings) {
      log(`Céglista figyelmeztetés: ${warning}`);
    }
    // A küldés feltételét (SMTP-jelszó) a letöltés előtt nézzük: a letöltés
    // átvétel, ne történjen meg, ha utána úgysem tudnánk továbbítani.
    const sender = createSender(options);

    if (!options.skipDownload) {
      const since = options.all ? null : (options.since ?? config.startDate);
      const firstRun = !existsSync(join(tarhelyDir, "index.jsonl"));
      if (firstRun && since === null && !options.all) {
        throw new Error(
          "Első futás: add meg, mettől érkezett leveleket töltsön le (a beállításokban „kezdo_datum”, vagy --since ÉÉÉÉ-HH-NN), vagy --mind kapcsolóval mindet. A letöltés átvételnek minősül!"
        );
      }
      log(`Letöltés a tárhelyről${since === null ? "" : ` (${since} óta érkezettek)`}…`);
      try {
        const { downloadFromPortal } = await import("./download.ts");
        const result = await downloadFromPortal({
          headed: options.headed,
          debugDir: options.debug ? join(config.dataDir, "debug") : null,
          log,
          tarhelyDir,
          since,
          max: config.maxLettersPerRun,
          skipMailboxes: config.skipMailboxes
        });
        for (const report of result.mailboxes) {
          log(
            `${report.mailbox}: ${report.total} levél, ${report.fresh} új, ${report.downloaded} letöltve${report.failed > 0 ? `, ${report.failed} sikertelen` : ""}`
          );
        }
        for (const failure of result.failures) {
          problems.push(`Letöltési hiba (${failure.mailbox}, ${failure.eid}): ${failure.error}`);
        }
        if (result.skippedByLimit > 0) {
          log(`${result.skippedByLimit} új levél a futásonkénti korlát miatt a következő futásra maradt.`);
        }
      } catch (error) {
        problems.push(`A tárhely letöltése nem sikerült: ${describeError(error)}`);
        log(problems.at(-1) ?? "");
      }
    }

    const report = await processLetters({
      config,
      companies,
      tarhelyDir,
      statePath: join(config.dataDir, options.proba ? "allapot-proba.json" : "allapot.json"),
      logPath: options.proba ? withSuffix(config.logPath, "-proba") : config.logPath,
      sender,
      proba: options.proba,
      log
    });
    Object.assign(counts, {
      newLetters: report.newLetters,
      emailed: report.emailed,
      unmatched: report.unmatched,
      skipped: report.skipped
    });
    problems.push(...report.emailFailures.map((failure) => `E-mail nem ment el: ${failure}`));
    log(
      `Kész: ${report.newLetters} új levél, ${report.emailed} e-mail${options.proba ? " (.eml fájlba)" : ""}, ${report.unmatched} céghez nem rendelhető, ${report.skipped} szűrő miatt kihagyva.`
    );

    if (problems.length > 0 && !options.proba) {
      await notifyProblems(options, sender, problems);
    }
    exitCode = problems.length > 0 ? 1 : 0;
    return exitCode;
  } catch (error) {
    allProblems.push(describeError(error));
    exitCode = 1;
    throw error;
  } finally {
    writeRunStatus(config.dataDir, {
      mode,
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: exitCode ?? 1,
      ...counts,
      problems: allProblems
    });
    release();
  }
}
