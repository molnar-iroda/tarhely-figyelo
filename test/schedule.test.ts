import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applySchedule, buildTaskXml, type CommandResult, nextRun, parseTimes, removeSchedule, scheduleState, setScheduleEnabled, type ScheduleDeps } from "../src/schedule.ts";
import { buildPlist, timesFromPlist } from "../src/schedule-mac.ts";

function fakeDeps(platform: NodeJS.Platform = "win32"): { deps: ScheduleDeps; calls: string[][]; tasks: Map<string, { time: string; enabled: boolean }> } {
  const tasks = new Map<string, { time: string; enabled: boolean }>();
  const calls: string[][] = [];
  const deps: ScheduleDeps = {
    platform,
    command: "wscript.exe",
    commandArguments: "//B x.vbs",
    schtasks(args): CommandResult {
      calls.push([...args]);
      const ok = (stdout = ""): CommandResult => ({ status: 0, stdout, stderr: "" });
      const name = args[args.indexOf("/TN") + 1] ?? "";
      if (args[0] === "/Query" && args.includes("/XML")) {
        const task = tasks.get(name);
        return ok(task === undefined ? "" : `<Task><Triggers><CalendarTrigger><StartBoundary>2026-01-01T${task.time}:00</StartBoundary></CalendarTrigger></Triggers><Settings><Enabled>${task.enabled}</Enabled></Settings></Task>`);
      }
      if (args[0] === "/Query") {
        return ok([...tasks.keys(), "Mas-feladat"].map((n) => `"\\${n}","N/A","Ready"`).join("\r\n"));
      }
      if (args[0] === "/Delete") {
        tasks.delete(name);
      } else if (args[0] === "/Create") {
        const time = /(\d{2})(\d{2})$/u.exec(name);
        tasks.set(name, { time: `${time?.[1]}:${time?.[2]}`, enabled: true });
      } else if (args[0] === "/Change") {
        const task = tasks.get(name);
        if (task !== undefined) {
          task.enabled = args.includes("/ENABLE");
        }
      }
      return ok();
    }
  };
  return { deps, calls, tasks };
}

describe("ütemezés", () => {
  it("az időpontokat ellenőrzi, rendezi és egységesíti", () => {
    assert.deepEqual(parseTimes(["16:00", "8:00", "08:00", "12:30"]), ["08:00", "12:30", "16:00"]);
    assert.throws(() => parseTimes(["25:00"]), /ÓÓ:PP/u);
    assert.throws(() => parseTimes(["8"]), /ÓÓ:PP/u);
    assert.throws(() => parseTimes([]), /Legalább egy/u);
  });

  it("a feladat XML-je hétköznapra szól, kimaradt futást pótol, és escape-el", () => {
    const xml = buildTaskXml("08:00", "C:\\Program Files\\x & y\\w.exe", '//B "a.vbs"');
    assert.match(xml, /T08:00:00/u);
    assert.match(xml, /<StartWhenAvailable>true</u);
    assert.match(xml, /<Monday \/>.*<Friday \/>/su);
    assert.doesNotMatch(xml, /<Saturday/u);
    assert.match(xml, /x &amp; y/u);
    assert.match(xml, /&quot;a\.vbs&quot;/u);
  });

  it("alkalmazáskor törli a régi feladatokat, és csak a sajátjait", () => {
    const { deps, tasks } = fakeDeps();
    tasks.set("Tarhely-figyelo", { time: "09:00", enabled: true });
    tasks.set("Tarhely-figyelo-08", { time: "08:00", enabled: true });
    assert.deepEqual(applySchedule(deps, ["16:00", "08:00"]), ["08:00", "16:00"]);
    assert.deepEqual([...tasks.keys()].sort(), ["Tarhely-figyelo-0800", "Tarhely-figyelo-1600"]);
    const state = scheduleState(deps, new Date(2026, 9, 29, 9, 0));
    assert.deepEqual(state.times, ["08:00", "16:00"]);
    assert.equal(state.enabled, true);
    assert.equal(state.nextRun, "2026-10-29 16:00");
    assert.equal(state.tasks.every((task) => !task.legacy), true);
  });

  it("kikapcsolva nem ad következő futást; a régi feladatot jelzi", () => {
    const { deps, tasks } = fakeDeps();
    applySchedule(deps, ["08:00"], false);
    assert.equal(scheduleState(deps).enabled, false);
    assert.equal(scheduleState(deps).nextRun, null);
    tasks.set("Tarhely-figyelo-12", { time: "12:00", enabled: true });
    assert.equal(scheduleState(deps).tasks.find((task) => task.name === "Tarhely-figyelo-12")?.legacy, true);
  });

  it("Linuxon nem támogatott, és nem hív schtasks-ot", () => {
    const { deps, calls } = fakeDeps("linux");
    assert.equal(scheduleState(deps).supported, false);
    assert.throws(() => applySchedule(deps, ["08:00"]), /Windowson/u);
    assert.equal(calls.length, 0);
  });

  it("a következő futás hétvégén a hétfői első időpont", () => {
    assert.equal(nextRun(["08:00", "12:00"], new Date(2026, 9, 31, 10, 0)), "2026-11-02 08:00");
    assert.equal(nextRun(["08:00", "12:00"], new Date(2026, 9, 30, 12, 0)), "2026-11-02 08:00");
    assert.equal(nextRun([], new Date()), null);
  });
});

describe("ütemezés macOS-en (launchd)", () => {
  function macDeps(): { deps: ScheduleDeps; calls: string[][]; dir: string; disabled: Set<string> } {
    const dir = mkdtempSync(join(tmpdir(), "tarhely-mac-"));
    const calls: string[][] = [];
    const disabled = new Set<string>();
    const deps: ScheduleDeps = {
      platform: "darwin",
      command: "",
      commandArguments: "",
      schtasks: () => ({ status: 1, stdout: "", stderr: "" }),
      launcher: ["/Applications/T & Y.app/futtatas.sh"],
      label: "teszt.tarhely",
      agentsDir: dir,
      uid: 501,
      logFile: join(dir, "naplo.log"),
      launchctl(args): CommandResult {
        calls.push([...args]);
        const target = args[1] ?? "";
        if (args[0] === "disable") {
          disabled.add(target.split("/").pop() ?? "");
        } else if (args[0] === "enable") {
          disabled.delete(target.split("/").pop() ?? "");
        } else if (args[0] === "print-disabled") {
          return { status: 0, stdout: `disabled services = {\n${[...disabled].map((l) => `\t"${l}" => disabled`).join("\n")}\n}`, stderr: "" };
        }
        return { status: 0, stdout: "", stderr: "" };
      }
    };
    return { deps, calls, dir, disabled };
  }

  it("a plist hétköznapra szól, escape-el, és visszaolvasható", () => {
    const xml = buildPlist("a.b", ["08:00", "16:30"], ["/x & y/f.sh", "futtatas"], "/tmp/l.log");
    assert.equal((xml.match(/<key>Weekday<\/key>/gu) ?? []).length, 10);
    assert.doesNotMatch(xml, /<integer>(0|6|7)<\/integer><key>Hour/u);
    assert.match(xml, /\/x &amp; y\/f\.sh/u);
    assert.deepEqual(timesFromPlist(xml), ["08:00", "16:30"]);
    assert.doesNotMatch(xml, /EnvironmentVariables/u);
    const pinned = buildPlist("a.b", ["08:00"], ["/f.sh"], "/tmp/l.log", { TARHELY_BEALLITASOK: "/Users/x/Library/Application Support/T & F/beallitasok.json" });
    assert.match(pinned, /<key>TARHELY_BEALLITASOK<\/key><string>\/Users\/x\/Library\/Application Support\/T &amp; F\/beallitasok\.json<\/string>/u);
  });

  it("alkalmazás: plist készül, betöltődik; az állapot visszaolvasható", () => {
    const { deps, calls, dir } = macDeps();
    try {
      assert.deepEqual(applySchedule(deps, ["16:00", "8:00"]), ["08:00", "16:00"]);
      assert.ok(existsSync(join(dir, "teszt.tarhely.plist")));
      assert.ok(calls.some((c) => c[0] === "bootstrap" && c[1] === "gui/501"));
      const state = scheduleState(deps, new Date(2026, 0, 5, 9, 0));
      assert.equal(state.supported, true);
      assert.deepEqual(state.times, ["08:00", "16:00"]);
      assert.equal(state.enabled, true);
      assert.equal(state.nextRun, "2026-01-05 16:00");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("kikapcsolás tartósan letilt, bekapcsolás visszaállít, törlés mindent takarít", () => {
    const { deps, calls, dir, disabled } = macDeps();
    try {
      applySchedule(deps, ["08:00"]);
      setScheduleEnabled(deps, false);
      assert.ok(disabled.has("teszt.tarhely"));
      assert.equal(scheduleState(deps).enabled, false);
      assert.equal(scheduleState(deps).nextRun, null);
      setScheduleEnabled(deps, true);
      assert.equal(scheduleState(deps).enabled, true);
      removeSchedule(deps);
      assert.equal(existsSync(join(dir, "teszt.tarhely.plist")), false);
      assert.equal(disabled.size, 0);
      assert.equal(scheduleState(deps).times.length, 0);
      assert.ok(calls.some((c) => c[0] === "bootout"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("kikapcsolva alkalmazva nem fut, de a plist megvan", () => {
    const { deps, dir } = macDeps();
    try {
      applySchedule(deps, ["08:00"], false);
      assert.equal(scheduleState(deps).enabled, false);
      assert.match(readFileSync(join(dir, "teszt.tarhely.plist"), "utf8"), /teszt\.tarhely/u);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
