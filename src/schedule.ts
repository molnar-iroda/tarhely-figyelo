// Az automatikus futás ütemezése a Windows Feladatütemezőjében (macOS-en a
// launchd-ben, lásd schedule-mac.ts): hétköznap a
// megadott időpontokban (alapból 8:00, 12:00, 16:00). A feladatokat XML-lel
// hozzuk létre, mert így állítható, hogy a kimaradt futás (kikapcsolt gép)
// bepótlódjon, és a lekérdezés is nyelvfüggetlen marad (a schtasks magyar
// Windowson magyar oszlopfejléceket ír, az XML nem).

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { macApply, macRemove, macSetEnabled, macTasks } from "./schedule-mac.ts";

export const TASK_PREFIX = "Tarhely-figyelo";
export const DEFAULT_TIMES: readonly string[] = ["08:00", "12:00", "16:00"];

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ScheduleDeps {
  readonly platform: NodeJS.Platform;
  /** A schtasks.exe futtatása; tesztben hamisítható. */
  readonly schtasks: (args: readonly string[]) => CommandResult;
  /** A feladat által indított parancs (rejtett ablakú indító). */
  readonly command: string;
  readonly commandArguments: string;
  /** macOS: a launchctl futtatása; tesztben hamisítható. */
  readonly launchctl?: (args: readonly string[]) => CommandResult;
  /** macOS: az ütemezett indító parancs (a `futtatas.sh` útvonala). */
  readonly launcher?: readonly string[];
  /** macOS: a LaunchAgent azonosítója, a plist mappája, a felhasználó azonosítója és a napló (tesztben felülírható). */
  readonly label?: string;
  readonly agentsDir?: string;
  readonly uid?: number;
  readonly logFile?: string;
  /** macOS: az ütemezett futás környezeti változói (pl. a beállításfájl rögzített útvonala). */
  readonly environment?: Readonly<Record<string, string>>;
}

export interface ScheduledTask {
  readonly name: string;
  /** HH:MM, vagy null, ha nem olvasható ki. */
  readonly time: string | null;
  readonly enabled: boolean;
  /** A régi (óránkénti vagy az UTMUTATO szerinti) feladat, amit az alkalmazás kivált. */
  readonly legacy: boolean;
}

export interface ScheduleState {
  readonly supported: boolean;
  readonly tasks: readonly ScheduledTask[];
  readonly times: readonly string[];
  readonly enabled: boolean;
  readonly nextRun: string | null;
}

export function systemDeps(command: string, commandArguments: string, launcher: readonly string[] = []): ScheduleDeps {
  return {
    platform: process.platform,
    command,
    commandArguments,
    launcher,
    launchctl(args) {
      const result = spawnSync("launchctl", [...args], { encoding: "utf8" });
      return {
        status: result.status ?? 1,
        stdout: result.stdout ?? "",
        stderr: (result.stderr ?? "") + (result.error === undefined ? "" : String(result.error))
      };
    },
    schtasks(args) {
      const result = spawnSync("schtasks", [...args], { encoding: "utf8", windowsHide: true });
      return {
        status: result.status ?? 1,
        stdout: result.stdout ?? "",
        stderr: (result.stderr ?? "") + (result.error === undefined ? "" : String(result.error))
      };
    }
  };
}

export function parseTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(value.trim());
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (match === null || hour > 23 || minute > 59) {
    throw new Error(`Az időpont ÓÓ:PP alakú legyen, például 08:00 (most: ${value}).`);
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseTimes(values: readonly string[]): string[] {
  const times = [...new Set(values.map(parseTime))].sort();
  if (times.length === 0) {
    throw new Error("Legalább egy időpont kell.");
  }
  if (times.length > 12) {
    throw new Error("Legfeljebb 12 időpont adható meg.");
  }
  return times;
}

function taskNameFor(time: string): string {
  return `${TASK_PREFIX}-${time.replace(":", "")}`;
}

function escapeXml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

export function buildTaskXml(time: string, command: string, commandArguments: string): string {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Cégkapu-tárhely figyelése (Tárhely-figyelő)</Description></RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2026-01-01T${time}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByWeek>
        <DaysOfWeek><Monday /><Tuesday /><Wednesday /><Thursday /><Friday /></DaysOfWeek>
        <WeeksInterval>1</WeeksInterval>
      </ScheduleByWeek>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT3H</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec><Command>${escapeXml(command)}</Command><Arguments>${escapeXml(commandArguments)}</Arguments></Exec>
  </Actions>
</Task>
`;
}

function listNames(deps: ScheduleDeps): string[] {
  const result = deps.schtasks(["/Query", "/FO", "CSV", "/NH"]);
  if (result.status !== 0) {
    return [];
  }
  const names: string[] = [];
  for (const line of result.stdout.split(/\r?\n/u)) {
    const match = /^"\\?([^"]+)"/u.exec(line);
    const name = match?.[1];
    if (name !== undefined && (name === TASK_PREFIX || name.startsWith(`${TASK_PREFIX}-`))) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

function timeFromName(name: string): string | null {
  const match = /^Tarhely-figyelo-(\d{2})(\d{2})?$/u.exec(name);
  return match === null ? null : `${match[1]}:${match[2] ?? "00"}`;
}

export function listTasks(deps: ScheduleDeps): ScheduledTask[] {
  if (deps.platform === "darwin") {
    return macTasks(deps).map(({ time, enabled }) => ({ name: `${TASK_PREFIX}-${time.replace(":", "")}`, time, enabled, legacy: false }));
  }
  if (deps.platform !== "win32") {
    return [];
  }
  return listNames(deps).map((name) => {
    const xml = deps.schtasks(["/Query", "/TN", name, "/XML"]).stdout;
    const start = /<StartBoundary>[^T<]*T(\d{2}):(\d{2})/u.exec(xml);
    const time = start === null ? timeFromName(name) : `${start[1]}:${start[2]}`;
    const enabled = !/<Enabled>\s*false\s*<\/Enabled>/iu.exec(xml.replace(/<Triggers>[\s\S]*?<\/Triggers>/u, ""));
    // Új feladat: a név HHMM; a régi „Tarhely-figyelo-08” és a puszta „Tarhely-figyelo” a régi telepítésé.
    return { name, time, enabled, legacy: !/^Tarhely-figyelo-\d{4}$/u.test(name) };
  });
}

/** A következő futás helyi ideje (hétköznap, a legkorábbi hátralévő időpont); a munkaszüneti napokat nem veszi figyelembe. */
export function nextRun(times: readonly string[], now: Date): string | null {
  if (times.length === 0) {
    return null;
  }
  const sorted = [...times].sort();
  for (let offset = 0; offset < 8; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (day.getDay() === 0 || day.getDay() === 6) {
      continue;
    }
    for (const time of sorted) {
      const [hour, minute] = time.split(":").map(Number);
      const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour ?? 0, minute ?? 0);
      if (candidate.getTime() > now.getTime()) {
        const pad = (value: number) => String(value).padStart(2, "0");
        return `${candidate.getFullYear()}-${pad(candidate.getMonth() + 1)}-${pad(candidate.getDate())} ${time}`;
      }
    }
  }
  return null;
}

export function scheduleState(deps: ScheduleDeps, now: Date = new Date()): ScheduleState {
  if (deps.platform !== "win32" && deps.platform !== "darwin") {
    return { supported: false, tasks: [], times: [], enabled: false, nextRun: null };
  }
  const tasks = listTasks(deps);
  const current = tasks.filter((task) => !task.legacy || task.time !== null);
  const times = [...new Set(current.map((task) => task.time).filter((time): time is string => time !== null))].sort();
  const enabled = current.some((task) => task.enabled);
  return { supported: true, tasks, times, enabled, nextRun: enabled ? nextRun(times, now) : null };
}

function requireSupported(deps: ScheduleDeps): void {
  if (deps.platform !== "win32" && deps.platform !== "darwin") {
    throw new Error("Az ütemezés csak Windowson és macOS-en érhető el.");
  }
}

function checked(result: CommandResult, what: string): void {
  if (result.status !== 0) {
    throw new Error(`${what} nem sikerült: ${(result.stderr || result.stdout).trim()}`);
  }
}

/** A régi feladatokat törli, és a megadott időpontokra újakat hoz létre. */
export function applySchedule(deps: ScheduleDeps, timesInput: readonly string[], enabled = true): string[] {
  requireSupported(deps);
  const times = parseTimes(timesInput);
  if (deps.platform === "darwin") {
    macApply(deps, times, enabled);
    return times;
  }
  for (const name of listNames(deps)) {
    checked(deps.schtasks(["/Delete", "/TN", name, "/F"]), `A(z) ${name} feladat törlése`);
  }
  const dir = mkdtempSync(join(tmpdir(), "tarhely-utemezes-"));
  try {
    for (const time of times) {
      const file = join(dir, `${taskNameFor(time)}.xml`);
      // A Feladatütemező UTF-16 LE (BOM-mal) XML-t vár.
      writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(buildTaskXml(time, deps.command, deps.commandArguments), "utf16le")]));
      checked(deps.schtasks(["/Create", "/TN", taskNameFor(time), "/XML", file, "/F"]), `A(z) ${time} feladat létrehozása`);
      if (!enabled) {
        checked(deps.schtasks(["/Change", "/TN", taskNameFor(time), "/DISABLE"]), `A(z) ${time} feladat kikapcsolása`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return times;
}

export function setScheduleEnabled(deps: ScheduleDeps, enabled: boolean): void {
  requireSupported(deps);
  if (deps.platform === "darwin") {
    macSetEnabled(deps, enabled);
    return;
  }
  for (const name of listNames(deps)) {
    checked(deps.schtasks(["/Change", "/TN", name, enabled ? "/ENABLE" : "/DISABLE"]), `A(z) ${name} átállítása`);
  }
}

export function removeSchedule(deps: ScheduleDeps): void {
  requireSupported(deps);
  if (deps.platform === "darwin") {
    macRemove(deps);
    return;
  }
  for (const name of listNames(deps)) {
    checked(deps.schtasks(["/Delete", "/TN", name, "/F"]), `A(z) ${name} feladat törlése`);
  }
}
