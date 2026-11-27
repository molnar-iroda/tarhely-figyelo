// A verziószám mindenhol ugyanaz, és a package.json-ből jön.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { composeLetterMail, composeNotice } from "../src/mailer.ts";
import { readRunStatus, writeRunStatus } from "../src/run-status.ts";
import { PRODUCT, VERSION } from "../src/version.ts";
import { record, tempDir, testConfig } from "./helpers.ts";

const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

describe("verziószám", () => {
  it("a package.json verziója", () => {
    assert.equal(VERSION, PKG.version);
    assert.equal(PRODUCT, `Tárhely-figyelő ${PKG.version}`);
  });

  it("--verzio, -v és a verzio parancs csak a számot írja ki", () => {
    for (const args of [["--verzio"], ["-v"], ["verzio"]]) {
      const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, `${PKG.version}\n`);
    }
    const help = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
    assert.match(help.stdout, new RegExp(`^Tárhely-figyelő ${PKG.version.replaceAll(".", "\\.")}:`));
  });

  it("a kiküldött levelek láblécében ott van", () => {
    const notice = composeNotice(["a@example.com"], "Tárgy", ["Szöveg"]);
    assert.ok(notice.text.endsWith(`Ezt a levelet a ${PRODUCT} automatikusan küldte.`));
    assert.ok(notice.html.includes(PRODUCT));
    const dir = tempDir("verzio");
    const mail = composeLetterMail(record({ recipients: ["k@example.com"] }), testConfig(dir), dir);
    assert.ok(mail.text.includes(PRODUCT));
    assert.ok(mail.html.includes(PRODUCT));
  });

  it("az utolsó futás összefoglalója megőrzi a verziót és az értesítések számát", () => {
    const dir = tempDir("verzio-allapot");
    writeRunStatus(dir, { mode: "futtatas", verzio: VERSION, startedAt: "2026-11-27T10:00:00Z", finishedAt: "2026-11-27T10:05:00Z", exitCode: 0, newLetters: 3, emailed: 2, unmatched: 0, skipped: 0, notified: 1, problems: [] });
    const status = readRunStatus(dir);
    assert.equal(status?.verzio, VERSION);
    assert.equal(status?.notified, 1);
  });
});
