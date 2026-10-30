// Az interaktív és ellenőrző parancsok: első beállítás, beállítások
// ellenőrzése, postafiókok listája, teszt e-mail.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCompanyList, matchByMailbox, writeCompanyTemplate } from "./companies.ts";
import type { Config } from "./config.ts";
import { loadConfig } from "./config.ts";
import { setupHint } from "./errors.ts";
import { composeNotice, smtpSender } from "./mailer.ts";
import type { Log } from "./runlog.ts";
import { keyring, SMTP_PASSWORD_ENV, smtpPassword } from "./secrets.ts";

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function runSetup(configPath: string): Promise<number> {
  const { ask, askHidden, confirm } = await import("./vendor/tarhely-cli/prompt.ts");
  const { isValidTotpSeed } = await import("./vendor/tarhely-cli/kau/totp.ts");
  const { isChromiumInstalled } = await import("./vendor/tarhely-cli/browser.ts");
  const { ugyfelkapuStore } = await import("./download.ts");
  const say = (message: string) => process.stderr.write(`${message}\n`);

  if (!existsSync(configPath)) {
    copyFileSync(join(PROJECT_DIR, "beallitasok.minta.json"), configPath);
    say(`Létrehoztam a beállításfájlt: ${resolve(configPath)} — töltsd ki (lásd README).`);
  }
  let config: Config | null = null;
  try {
    config = loadConfig(configPath);
  } catch (error) {
    say(`A beállításfájl még nem jó: ${error instanceof Error ? error.message : String(error)}`);
  }
  const companyListPath = config?.companyListPath ?? join(dirname(resolve(configPath)), "ceglista.xlsx");
  if (!existsSync(companyListPath)) {
    await writeCompanyTemplate(companyListPath);
    say(`Létrehoztam a minta céglistát: ${companyListPath} — írd át a saját cégeitekre.`);
  }

  say("\nA jelszavak és a kulcs gépelés közben nem látszanak, és csak a rendszer kulcstartójába kerülnek.");
  if (await confirm("\nRögzítsem most az Ügyfélkapu+ belépőt?")) {
    const username = await ask("Ügyfélkapu felhasználónév: ");
    const password = await askHidden("Ügyfélkapu jelszó: ");
    let totpSeed = await askHidden("Hitelesítő alkalmazás kulcsa (TOTP-seed): ");
    while (!isValidTotpSeed(totpSeed)) {
      say("Ez nem érvényes kulcs. A QR-kód alatti „Nem tudom beolvasni a kódot” betű-szám sorát kérem.");
      totpSeed = await askHidden("TOTP-seed: ");
    }
    if (username === "" || password === "") {
      say("A felhasználónév és a jelszó nem lehet üres; a belépőt nem mentettem.");
    } else {
      ugyfelkapuStore().save({
        username,
        password,
        totpSeed: totpSeed.replace(/[\s-]+/g, "").toUpperCase()
      });
      say("Ügyfélkapu+ belépő elmentve.");
    }
  }

  if (await confirm("\nRögzítsem most az SMTP (levelező) jelszót?")) {
    const password = await askHidden("SMTP jelszó: ");
    if (password !== "") {
      keyring("smtp").set(password);
      say("SMTP jelszó elmentve.");
    }
  }

  if (!isChromiumInstalled()) {
    say("\nA böngésző (Chromium) telepítése, egyszeri, kb. 150 MB…");
    const cli = join(dirname(createRequire(import.meta.url).resolve("playwright/package.json")), "cli.js");
    const result = spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" });
    if (result.status !== 0) {
      say("A Chromium telepítése nem sikerült. Futtasd kézzel: npx playwright install chromium");
      return 1;
    }
  }

  say("\nKövetkező lépések:");
  say("  1. npm run ellenorzes   – beállítások és céglista ellenőrzése");
  say("  2. npm run teszt-email -- sajat@example.com");
  say("  3. npm run postafiokok  – belépés, és melyik postafiók melyik könyvelőhöz kerül");
  return 0;
}

export async function runCheck(config: Config, log: Log): Promise<number> {
  let ok = true;
  const { companies, warnings } = await loadCompanyList(config.companyListPath);
  log(`Céglista: ${companies.length} cég.`);
  for (const company of companies) {
    log(`  ${company.name} (${company.taxNumber || "nincs adószám"}) → ${company.accountant} <${company.emails.join(", ")}>`);
  }
  for (const warning of warnings) {
    log(`  Figyelmeztetés: ${warning}`);
  }
  if (config.smtp.user !== "") {
    if (smtpPassword() === null) {
      ok = false;
      log(`Nincs SMTP-jelszó (${setupHint()}, vagy ${SMTP_PASSWORD_ENV} env-változó).`);
    } else {
      log("SMTP-jelszó: megvan.");
    }
  }
  const { ugyfelkapuStore } = await import("./download.ts");
  if (ugyfelkapuStore().load() === null) {
    ok = false;
    log(`Nincs Ügyfélkapu+ belépő (${setupHint()}).`);
  } else {
    log("Ügyfélkapu+ belépő: megvan.");
  }
  const { isChromiumInstalled } = await import("./vendor/tarhely-cli/browser.ts");
  if (!isChromiumInstalled()) {
    ok = false;
    log("Nincs telepítve a Chromium (npx playwright install chromium).");
  }
  if (config.startDate === null) {
    log("Figyelem: nincs „kezdo_datum”, az első futáshoz --since vagy --mind kell.");
  }
  log(ok ? "Minden rendben." : "Javítsd a fenti hiányokat.");
  return ok ? 0 : 1;
}

export async function runMailboxList(config: Config, log: Log, headed: boolean): Promise<number> {
  const { companies } = await loadCompanyList(config.companyListPath);
  const { listPortal, selectMailboxes } = await import("./download.ts");
  const { mailboxes, letters } = await listPortal({
    headed,
    debugDir: null,
    log,
    tarhelyDir: join(config.dataDir, "tarhely")
  });
  const processed = new Set(selectMailboxes(mailboxes, config.skipMailboxes).map((item) => item.name));
  log("Postafiókok (semmit nem töltöttem le):");
  for (const mailbox of mailboxes) {
    const own = letters.filter((letter) => letter.mailbox === mailbox.name);
    const fresh = own.filter((letter) => letter.isNew).length;
    const company = matchByMailbox(mailbox.name, companies);
    const target = !processed.has(mailbox.name)
      ? "kihagyva (beállítás)"
      : company === null
        ? `NINCS a céglistában → ${config.defaultRecipients.join(", ")}`
        : `${company.name} → ${company.accountant} <${company.emails.join(", ")}>`;
    log(`  ${mailbox.index + 1}. ${mailbox.name}: ${own.length} levél, ${fresh} még nem letöltött — ${target}`);
  }
  return 0;
}

export async function runTestEmail(config: Config, log: Log, to: string | undefined): Promise<number> {
  if (to === undefined || !to.includes("@")) {
    log("Add meg a címzettet: npm run teszt-email -- valaki@example.com");
    return 1;
  }
  const password = config.smtp.user === "" ? null : smtpPassword();
  if (config.smtp.user !== "" && password === null) {
    log(`Nincs rögzített SMTP-jelszó. Rögzítsd: ${setupHint()}`);
    return 1;
  }
  const mail = composeNotice([to], "Tárhely-figyelő: teszt e-mail", [
    "Ez egy teszt e-mail: a levelezés beállítása működik."
  ]);
  await smtpSender(config.smtp, password).send(mail, config.smtp.from);
  log(`Teszt e-mail elküldve: ${to}`);
  return 0;
}
