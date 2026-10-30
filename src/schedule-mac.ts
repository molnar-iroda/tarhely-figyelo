// Az automatikus futás ütemezése macOS-en: egyetlen LaunchAgent
// (~/Library/LaunchAgents), hétköznapra és a megadott időpontokra. A launchd a
// gép alvása közben kimaradt futást ébredéskor pótolja; kikapcsolt gépen nem.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { CommandResult, ScheduleDeps } from "./schedule.ts";

export const DEFAULT_LABEL = "hu.iroda.tarhely-figyelo";

/** Az ütemezés azonosítója; tesztben/CI-ban felülírható, hogy ne érje a valódi feladatot. */
export function labelOf(deps: ScheduleDeps): string {
  return deps.label ?? process.env.TARHELY_UTEMEZES_CIMKE ?? DEFAULT_LABEL;
}

function agentsDirOf(deps: ScheduleDeps): string {
  return deps.agentsDir ?? join(homedir(), "Library", "LaunchAgents");
}

export function plistPathOf(deps: ScheduleDeps): string {
  return join(agentsDirOf(deps), `${labelOf(deps)}.plist`);
}

function domainOf(deps: ScheduleDeps): string {
  return `gui/${deps.uid ?? process.getuid?.() ?? 501}`;
}

function launchctl(deps: ScheduleDeps, args: readonly string[]): CommandResult {
  if (deps.launchctl === undefined) {
    return { status: 1, stdout: "", stderr: "Nincs launchctl." };
  }
  return deps.launchctl(args);
}

function escapeXml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

export function buildPlist(label: string, times: readonly string[], launcher: readonly string[], logFile: string, environment: Readonly<Record<string, string>> = {}): string {
  const variables = Object.entries(environment);
  const intervals: string[] = [];
  for (const weekday of [1, 2, 3, 4, 5]) {
    for (const time of times) {
      const [hour, minute] = time.split(":").map(Number);
      intervals.push(`    <dict><key>Weekday</key><integer>${weekday}</integer><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${launcher.map((part) => `    <string>${escapeXml(part)}</string>`).join("\n")}
  </array>
  <key>StartCalendarInterval</key>
  <array>
${intervals.join("\n")}
  </array>
${variables.length === 0 ? "" : `  <key>EnvironmentVariables</key>\n  <dict>\n${variables.map(([key, value]) => `    <key>${escapeXml(key)}</key><string>${escapeXml(value)}</string>`).join("\n")}\n  </dict>\n`}  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${escapeXml(logFile)}</string>
  <key>StandardErrorPath</key><string>${escapeXml(logFile)}</string>
</dict>
</plist>
`;
}

/** Az időpontok a plist-ből (a hétköznapok ismétlődését összevonva). */
export function timesFromPlist(xml: string): string[] {
  const times = new Set<string>();
  for (const dict of xml.matchAll(/<dict>([\s\S]*?)<\/dict>/gu)) {
    const body = dict[1] ?? "";
    const hour = /<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/u.exec(body);
    const minute = /<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/u.exec(body);
    if (hour !== null && minute !== null) {
      times.add(`${String(hour[1]).padStart(2, "0")}:${String(minute[1]).padStart(2, "0")}`);
    }
  }
  return [...times].sort();
}

function isDisabled(deps: ScheduleDeps): boolean {
  const result = launchctl(deps, ["print-disabled", domainOf(deps)]);
  const escaped = labelOf(deps).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`"${escaped}"\\s*=>\\s*(true|disabled)`, "u").test(result.stdout);
}

export function macTasks(deps: ScheduleDeps): { time: string; enabled: boolean }[] {
  const path = plistPathOf(deps);
  if (!existsSync(path)) {
    return [];
  }
  const enabled = !isDisabled(deps);
  return timesFromPlist(readFileSync(path, "utf8")).map((time) => ({ time, enabled }));
}

function bootout(deps: ScheduleDeps): void {
  // Ha nincs betöltve, hibát ad; ez nem baj.
  launchctl(deps, ["bootout", `${domainOf(deps)}/${labelOf(deps)}`]);
}

function checked(result: CommandResult, what: string): void {
  if (result.status !== 0) {
    throw new Error(`${what} nem sikerült: ${(result.stderr || result.stdout).trim()}`);
  }
}

export function macApply(deps: ScheduleDeps, times: readonly string[], enabled: boolean): void {
  if (deps.launcher === undefined || deps.launcher.length === 0) {
    throw new Error("Nincs megadva az ütemezett indító.");
  }
  const label = labelOf(deps);
  const path = plistPathOf(deps);
  const logFile = deps.logFile ?? join(homedir(), "Library", "Logs", "Tarhely-figyelo", "utemezett-futas.log");
  mkdirSync(dirname(path), { recursive: true });
  mkdirSync(dirname(logFile), { recursive: true });
  bootout(deps);
  writeFileSync(path, buildPlist(label, times, deps.launcher, logFile, deps.environment));
  checked(launchctl(deps, ["enable", `${domainOf(deps)}/${label}`]), "Az ütemezés engedélyezése");
  checked(launchctl(deps, ["bootstrap", domainOf(deps), path]), "Az ütemezés betöltése");
  if (!enabled) {
    macSetEnabled(deps, false);
  }
}

export function macSetEnabled(deps: ScheduleDeps, enabled: boolean): void {
  const path = plistPathOf(deps);
  if (!existsSync(path)) {
    return;
  }
  const target = `${domainOf(deps)}/${labelOf(deps)}`;
  if (enabled) {
    checked(launchctl(deps, ["enable", target]), "Az ütemezés bekapcsolása");
    bootout(deps);
    checked(launchctl(deps, ["bootstrap", domainOf(deps), path]), "Az ütemezés betöltése");
  } else {
    // A „disable” újraindítás után is megmarad; a bootout azonnal leállítja.
    checked(launchctl(deps, ["disable", target]), "Az ütemezés kikapcsolása");
    bootout(deps);
  }
}

export function macRemove(deps: ScheduleDeps): void {
  bootout(deps);
  // A letiltási jelölést is töröljük, hogy ne maradjon szemét a launchd-ben.
  launchctl(deps, ["enable", `${domainOf(deps)}/${labelOf(deps)}`]);
  rmSync(plistPathOf(deps), { force: true });
}
