// A kezelőfelület műveletei: állapot, beállítások, titkok, levelek, napló,
// ütemezés és a parancssori műveletek indítása. A böngészőnek csak olyan adat
// megy, ami nem titok: a jelszavak és a TOTP-kulcs sosem hagyja el a kulcstartót.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { type Company, loadCompanyList, writeCompanyTemplate } from "../companies.ts";
import { type Config, loadConfig, parseConfig } from "../config.ts";
import { isIsoDate } from "../dates.ts";
import { describeError } from "../errors.ts";
import { readRunStatus } from "../run-status.ts";
import {
  applySchedule,
  DEFAULT_TIMES,
  removeSchedule,
  type ScheduleDeps,
  scheduleState,
  setScheduleEnabled,
  systemDeps
} from "../schedule.ts";
import { keyring } from "../secrets.ts";
import { loadState, writeFileAtomic } from "../state.ts";
import { localDate } from "../time.ts";
import type { Credentials, CredentialStore, KeyringAdapter } from "../vendor/tarhely-cli/store/credentials.ts";
import { type OperationName, type OperationRequest, type Operations } from "./operations.ts";

export interface ApiResult {
  readonly status: number;
  readonly body: unknown;
  readonly file?: { readonly name: string; readonly type: string; readonly content: Buffer };
}

export interface ApiDeps {
  readonly projectDir: string;
  readonly configPath: string;
  readonly operations: Operations;
  readonly ugyfelkapu: () => Promise<CredentialStore>;
  readonly smtpKeyring: KeyringAdapter;
  readonly chromiumInstalled: () => Promise<boolean>;
  readonly validTotpSeed: (value: string) => Promise<boolean>;
  readonly schedule: ScheduleDeps;
  readonly openPath: (path: string) => void;
  readonly now: () => Date;
}

export interface Api {
  handle(method: string, path: string, query: URLSearchParams, body: unknown): Promise<ApiResult>;
  lockPath(): string | null;
}

type Json = Record<string, unknown>;

class BadRequest extends Error {}

const ok = (body: unknown = { ok: true }): ApiResult => ({ status: 200, body });
const bad = (message: string, status = 400): ApiResult => ({ status, body: { hiba: message } });

function object(value: unknown): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequest("A kérés törzse nem megfelelő.");
  }
  return value as Json;
}

function text(value: unknown, field: string, max = 500): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string" || value.length > max) {
    throw new BadRequest(`A(z) „${field}” mező nem megfelelő.`);
  }
  return value;
}

export function defaultOpenPath(path: string): void {
  const [command, args]: [string, string[]] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", path]]
      : process.platform === "darwin"
        ? ["open", [path]]
        : ["xdg-open", [path]];
  spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

export function buildApi(partial: Partial<ApiDeps> & Pick<ApiDeps, "projectDir" | "configPath" | "operations">): Api {
  const deps: ApiDeps = {
    ugyfelkapu: async () => (await import("../download.ts")).ugyfelkapuStore(),
    smtpKeyring: keyring("smtp"),
    chromiumInstalled: async () => (await import("../vendor/tarhely-cli/browser.ts")).isChromiumInstalled(),
    validTotpSeed: async (value) => (await import("../vendor/tarhely-cli/kau/totp.ts")).isValidTotpSeed(value),
    schedule: {
      ...systemDeps("wscript.exe", `//B //Nologo "${join(partial.projectDir, "futtatas-rejtett.vbs")}"`, [join(partial.projectDir, "futtatas.sh")]),
      environment: { TARHELY_BEALLITASOK: resolve(partial.configPath) }
    },
    openPath: defaultOpenPath,
    now: () => new Date(),
    ...partial
  };
  const configPath = resolve(deps.configPath);
  const sampleConfig = () => JSON.parse(readFileSync(join(deps.projectDir, "beallitasok.minta.json"), "utf8")) as Json;

  const caches = new Map<string, { stamp: string; value: unknown }>();
  async function cached<T>(path: string, load: () => Promise<T> | T): Promise<T> {
    let stamp = "hiany";
    try {
      const info = statSync(path);
      stamp = `${info.mtimeMs}:${info.size}`;
    } catch {
      // nincs fájl: a betöltő dönt
    }
    const hit = caches.get(path);
    if (hit !== undefined && hit.stamp === stamp) {
      return hit.value as T;
    }
    const value = await load();
    caches.set(path, { stamp, value });
    return value;
  }

  function currentConfig(): { config: Config | null; error: string | null } {
    try {
      return { config: loadConfig(configPath), error: null };
    } catch (error) {
      return { config: null, error: describeError(error) };
    }
  }

  function requireConfig(): Config {
    const { config, error } = currentConfig();
    if (config === null) {
      throw new BadRequest(error ?? "A beállítások nem olvashatók.");
    }
    return config;
  }

  async function companies(config: Config): Promise<{ list: readonly Company[]; warnings: readonly string[]; error: string | null }> {
    try {
      const { companies: list, warnings } = await cached(config.companyListPath, () => loadCompanyList(config.companyListPath));
      return { list, warnings, error: null };
    } catch (error) {
      return { list: [], warnings: [], error: describeError(error) };
    }
  }

  async function credentialInfo(): Promise<{ username: string | null; present: boolean; error: string | null }> {
    try {
      const credentials = (await deps.ugyfelkapu()).load();
      return { username: credentials?.username ?? null, present: credentials !== null, error: null };
    } catch (error) {
      return { username: null, present: false, error: describeError(error) };
    }
  }

  function smtpPasswordPresent(): boolean {
    const fromEnv = process.env.SMTP_JELSZO;
    return (fromEnv !== undefined && fromEnv !== "") || deps.smtpKeyring.get() !== null;
  }

  const lockFile = (config: Config) => join(config.dataDir, "futas.lock");

  async function status(): Promise<ApiResult> {
    const { config, error } = currentConfig();
    const version = (JSON.parse(readFileSync(join(deps.projectDir, "package.json"), "utf8")) as { version?: string }).version ?? "?";
    const schedule = scheduleState(deps.schedule, deps.now());
    const operation = deps.operations.view();
    const base = {
      verzio: version,
      beallitasFajl: configPath,
      beallitasHiba: error,
      muvelet: operation,
      utemezes: schedule
    };
    if (config === null) {
      return ok({ ...base, kesz: false, ellenorzes: [], statisztika: null, utolsoFutas: null, zar: null });
    }
    const companyInfo = await companies(config);
    const credentials = await credentialInfo();
    const chromium = await deps.chromiumInstalled();
    const statePath = join(config.dataDir, "allapot.json");
    const state = await cached(statePath, () => loadState(statePath));
    const today = localDate(deps.now());
    const letters = Object.values(state.letters);
    const stats = {
      osszes: letters.length,
      ma: letters.filter((letter) => letter.downloadedAt.slice(0, 10) === today || localDate(new Date(letter.downloadedAt)) === today).length,
      fuggo: letters.filter((letter) => letter.emailStatus === "fuggo").length,
      hibas: letters.filter((letter) => letter.emailStatus === "hiba").length,
      cegNelkul: letters.filter((letter) => letter.matchedBy === null && letter.emailStatus !== "kihagyva").length,
      kozeliHatarido: letters
        .filter((letter) => letter.deadline !== null && letter.deadline >= today && letter.emailStatus !== "proba")
        .map((letter) => ({ eid: letter.eid, datum: letter.deadline, ceg: letter.company, targy: letter.subject, ocr: letter.deadlineOcr === true, szamitott: letter.deadlineComputed }))
        .sort((a, b) => String(a.datum).localeCompare(String(b.datum)))
        .slice(0, 8)
    };
    const firstRun = !existsSync(join(config.dataDir, "tarhely", "index.jsonl"));
    const checks = [
      { id: "ugyfelkapu", ok: credentials.present, cim: "Ügyfélkapu+ belépő", reszlet: credentials.present ? `Megvan (${credentials.username ?? "?"}).` : (credentials.error ?? "Még nincs megadva."), ful: "beallitasok" },
      {
        id: "smtp",
        ok: config.smtp.user === "" || smtpPasswordPresent(),
        cim: "E-mail küldés (SMTP-jelszó)",
        reszlet: config.smtp.user === "" ? "Hitelesítés nélküli belső továbbító." : smtpPasswordPresent() ? "A jelszó megvan." : "Még nincs megadva a jelszó.",
        ful: "beallitasok"
      },
      {
        id: "ceglista",
        ok: companyInfo.error === null && companyInfo.list.length > 0,
        cim: "Céglista",
        reszlet: companyInfo.error ?? `${companyInfo.list.length} cég${companyInfo.warnings.length > 0 ? `, ${companyInfo.warnings.length} figyelmeztetés` : ""}.`,
        ful: "cegek"
      },
      { id: "chromium", ok: chromium, cim: "Böngésző a tárhely eléréséhez", reszlet: chromium ? "Telepítve." : "Nincs telepítve (a telepítő ezt pótolja).", ful: "attekintes" },
      {
        id: "kezdo",
        ok: !firstRun || config.startDate !== null,
        cim: "Kezdő dátum",
        reszlet: !firstRun ? "Az első letöltés már megtörtént." : config.startDate !== null ? `A ${config.startDate} óta érkezett leveleket tölti le.` : "Add meg, mettől töltsön le leveleket – a letöltés átvételnek számít!",
        ful: "beallitasok"
      },
      {
        id: "utemezes",
        ok: schedule.supported ? schedule.enabled : true,
        cim: "Automatikus futás",
        reszlet: !schedule.supported ? "Csak Windowson és macOS-en érhető el." : schedule.enabled ? `Hétköznap ${schedule.times.join(", ")}.` : "Nincs bekapcsolva.",
        ful: "utemezes"
      }
    ];
    const lock = existsSync(lockFile(config))
      ? { korPerc: Math.round((deps.now().getTime() - statSync(lockFile(config)).mtimeMs) / 60000) }
      : null;
    return ok({
      ...base,
      kesz: true,
      adatmappa: config.dataDir,
      ellenorzes: checks,
      statisztika: stats,
      utolsoFutas: readRunStatus(config.dataDir),
      zar: lock,
      elsoFutas: firstRun
    });
  }

  function readSettings(): ApiResult {
    const exists = existsSync(configPath);
    let data: Json;
    let error: string | null = null;
    if (exists) {
      try {
        data = object(JSON.parse(readFileSync(configPath, "utf8").replace(/^﻿/u, "")));
      } catch (caught) {
        data = sampleConfig();
        error = `A beállításfájl nem olvasható (${describeError(caught)}); a minta látszik, mentéskor felülíródik.`;
      }
    } else {
      data = sampleConfig();
    }
    return ok({ letezik: exists, adatok: data, hiba: error, fajl: configPath });
  }

  function saveSettings(body: unknown): ApiResult {
    const data = object(object(body).adatok);
    try {
      parseConfig(JSON.stringify(data), configPath);
    } catch (error) {
      return bad(describeError(error), 422);
    }
    writeFileAtomic(configPath, `${JSON.stringify(data, null, 2)}\n`);
    caches.clear();
    return ok();
  }

  async function secretsInfo(): Promise<ApiResult> {
    const credentials = await credentialInfo();
    const { config } = currentConfig();
    return ok({
      ugyfelkapu: { megvan: credentials.present, felhasznalo: credentials.username, hiba: credentials.error },
      smtp: { kell: config === null ? true : config.smtp.user !== "", megvan: smtpPasswordPresent() }
    });
  }

  async function saveSecrets(body: unknown): Promise<ApiResult> {
    const input = object(body);
    const saved: string[] = [];
    if (input.ugyfelkapu !== undefined && input.ugyfelkapu !== null) {
      const fields = object(input.ugyfelkapu);
      const store = await deps.ugyfelkapu();
      let existing: Credentials | null = null;
      try {
        existing = store.load();
      } catch {
        existing = null;
      }
      const username = text(fields.felhasznalo, "felhasználónév").trim() || existing?.username || "";
      const password = text(fields.jelszo, "jelszó") || existing?.password || "";
      const seedInput = text(fields.totp, "TOTP-kulcs");
      const totpSeed = seedInput !== "" ? seedInput.replace(/[\s-]+/gu, "").toUpperCase() : (existing?.totpSeed ?? "");
      if (username === "" || password === "" || totpSeed === "") {
        return bad("Az Ügyfélkapu+ belépőhöz a felhasználónév, a jelszó és a hitelesítő alkalmazás kulcsa is kell.", 422);
      }
      if (seedInput !== "" && !(await deps.validTotpSeed(totpSeed))) {
        return bad("A hitelesítő alkalmazás kulcsa nem érvényes. A QR-kód alatti „Nem tudom beolvasni a kódot” betű-szám sorát add meg.", 422);
      }
      store.save({ username, password, totpSeed });
      saved.push("ugyfelkapu");
    }
    const smtp = text(input.smtpJelszo, "SMTP-jelszó");
    if (smtp !== "") {
      deps.smtpKeyring.set(smtp);
      saved.push("smtp");
    }
    return ok({ mentve: saved });
  }

  async function letters(query: URLSearchParams): Promise<ApiResult> {
    const config = requireConfig();
    const statePath = join(config.dataDir, "allapot.json");
    const state = await cached(statePath, () => loadState(statePath));
    const search = (query.get("q") ?? "").trim().toLowerCase();
    const statusFilter = query.get("allapot") ?? "";
    const rows = Object.values(state.letters)
      .filter((letter) => statusFilter === "" || letter.emailStatus === statusFilter)
      .filter((letter) => search === "" || `${letter.company} ${letter.subject} ${letter.accountant} ${letter.mailbox}`.toLowerCase().includes(search))
      .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))
      .slice(0, 500)
      .map((letter) => ({
        eid: letter.eid,
        letoltve: letter.downloadedAt,
        ceg: letter.company || letter.mailbox,
        felelos: letter.accountant,
        targy: letter.subject,
        tipus: letter.type,
        hatarido: letter.deadline,
        szamitott: letter.deadlineComputed,
        lejart: letter.deadlineExpired === true,
        ocr: letter.deadlineOcr === true,
        megjegyzes: letter.deadlineNote,
        allapot: letter.emailStatus,
        hiba: letter.emailError,
        probalkozas: letter.emailAttempts,
        elkuldve: letter.emailedAt,
        cegNelkul: letter.matchedBy === null
      }));
    return ok({ sorok: rows, osszes: Object.keys(state.letters).length });
  }

  function logs(query: URLSearchParams): ApiResult {
    const config = requireConfig();
    const dir = join(config.dataDir, "naplo");
    const months = existsSync(dir)
      ? readdirSync(dir)
          .map((name) => /^(\d{4}-\d{2})\.log$/u.exec(name)?.[1])
          .filter((month): month is string => month !== undefined)
          .sort()
          .reverse()
      : [];
    const requested = query.get("honap");
    if (requested !== null && !/^\d{4}-\d{2}$/u.test(requested)) {
      return bad("Érvénytelen hónap.");
    }
    const month = requested ?? months[0] ?? null;
    let lines: string[] = [];
    if (month !== null && months.includes(month)) {
      lines = readFileSync(join(dir, `${month}.log`), "utf8").split(/\r?\n/u).filter((line) => line !== "");
    }
    if (query.get("hibak") === "1") {
      lines = lines.filter((line) => /hiba|nem sikerült|sikertelen|lejárt|figyelmeztet|nem ment el/iu.test(line));
    }
    return ok({ honapok: months, honap: month, sorok: lines.slice(-600) });
  }

  async function companyView(): Promise<ApiResult> {
    const config = requireConfig();
    if (!existsSync(config.companyListPath)) {
      mkdirSync(dirname(config.companyListPath), { recursive: true });
      await writeCompanyTemplate(config.companyListPath);
    }
    const info = await companies(config);
    return ok({
      fajl: config.companyListPath,
      hiba: info.error,
      figyelmeztetesek: info.warnings,
      alapertelmezett: config.defaultRecipients,
      cegek: info.list.map((company) => ({ nev: company.name, adoszam: company.taxNumber, felelos: company.accountant, emailek: company.emails }))
    });
  }

  function openTarget(body: unknown): ApiResult {
    const config = requireConfig();
    const targets: Record<string, string> = {
      adatmappa: config.dataDir,
      naplo: join(config.dataDir, "naplo"),
      ceglista: config.companyListPath,
      excel: config.logPath,
      proba: join(config.dataDir, "proba-emailek"),
      beallitasmappa: dirname(configPath)
    };
    const key = text(object(body).mit, "mit", 40);
    const path = targets[key];
    if (path === undefined) {
      return bad("Ismeretlen cél.");
    }
    if (!existsSync(path)) {
      return bad(`Még nincs ilyen: ${path}`, 404);
    }
    deps.openPath(path);
    return ok();
  }

  const OPERATIONS: readonly OperationName[] = ["futtatas", "proba", "feldolgozas", "ellenorzes", "postafiokok", "teszt-email"];

  function startOperation(body: unknown): ApiResult {
    const input = object(body);
    const name = text(input.nev, "nev", 40) as OperationName;
    if (!OPERATIONS.includes(name)) {
      return bad("Ismeretlen művelet.");
    }
    requireConfig();
    const since = text(input.since, "since", 10);
    if (since !== "" && !isIsoDate(since)) {
      return bad("A dátum ÉÉÉÉ-HH-NN alakú legyen.");
    }
    const to = text(input.cim, "cim", 200).trim();
    if (name === "teszt-email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(to)) {
      return bad("Adj meg egy érvényes e-mail címet.");
    }
    if (name === "futtatas" && input.megerosites !== true) {
      return bad("Az éles futás letölt és e-mailt küld; a letöltés átvételnek számít. Erősítsd meg.", 422);
    }
    const request: OperationRequest = { name, since: since || undefined, all: input.mind === true, to: to || undefined };
    return ok(deps.operations.start(request));
  }

  async function scheduleView(): Promise<ApiResult> {
    return ok({ ...scheduleState(deps.schedule, deps.now()), alapertelmezett: DEFAULT_TIMES, platform: deps.schedule.platform });
  }

  function lockPath(): string | null {
    const { config } = currentConfig();
    return config === null ? null : lockFile(config);
  }

  async function handle(method: string, path: string, query: URLSearchParams, body: unknown): Promise<ApiResult> {
    try {
      const route = `${method} ${path}`;
      switch (route) {
        case "GET /api/allapot":
          return await status();
        case "GET /api/beallitasok":
          return readSettings();
        case "POST /api/beallitasok":
          return saveSettings(body);
        case "GET /api/titkok":
          return await secretsInfo();
        case "POST /api/titkok":
          return await saveSecrets(body);
        case "GET /api/levelek":
          return await letters(query);
        case "GET /api/naplo":
          return logs(query);
        case "GET /api/cegek":
          return await companyView();
        case "POST /api/megnyitas":
          return openTarget(body);
        case "GET /api/muvelet":
          return ok(deps.operations.view());
        case "POST /api/muvelet":
          return startOperation(body);
        case "POST /api/muvelet/megszakit":
          deps.operations.stop();
          return ok();
        case "GET /api/utemezes":
          return await scheduleView();
        case "POST /api/utemezes": {
          const input = object(body);
          const times = Array.isArray(input.idopontok) ? input.idopontok.map((item) => text(item, "időpont", 5)) : [];
          applySchedule(deps.schedule, times, input.bekapcsolva !== false);
          return await scheduleView();
        }
        case "POST /api/utemezes/kapcsol":
          setScheduleEnabled(deps.schedule, object(body).bekapcsolva === true);
          return await scheduleView();
        case "POST /api/utemezes/torles":
          removeSchedule(deps.schedule);
          return await scheduleView();
        case "POST /api/zar-torles": {
          if (deps.operations.view().running) {
            return bad("Most fut egy művelet.", 409);
          }
          const lock = lockPath();
          if (lock !== null && existsSync(lock)) {
            unlinkSync(lock);
          }
          return ok();
        }
        default:
          return bad("Ismeretlen kérés.", 404);
      }
    } catch (error) {
      if (error instanceof BadRequest) {
        return bad(error.message);
      }
      return bad(describeError(error), 500);
    }
  }

  return { handle, lockPath };
}
