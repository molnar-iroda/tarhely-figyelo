// Az `utemezes` parancs: az automatikus futás kezelése a parancssorból (a
// telepítő is ezt használja).

import { join, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { defaultConfigPath } from "./config.ts";
import { applySchedule, DEFAULT_TIMES, removeSchedule, scheduleState, setScheduleEnabled, systemDeps } from "./schedule.ts";

const PROJECT_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export function runSchedule(args: readonly string[]): number {
  const say = (message: string) => process.stdout.write(`${message}\n`);
  const base = systemDeps("wscript.exe", `//B //Nologo "${join(PROJECT_DIR, "futtatas-rejtett.vbs")}"`, [join(PROJECT_DIR, "futtatas.sh")]);
  const deps = { ...base, environment: { TARHELY_BEALLITASOK: resolve(defaultConfigPath()) } };
  const [action, ...rest] = args;
  switch (action) {
    case "allapot": {
      const state = scheduleState(deps);
      if (!state.supported) {
        say("Az ütemezés csak Windowson és macOS-en érhető el.");
        return 0;
      }
      say(`Feladatok: ${state.tasks.map((task) => `${task.name} (${task.time ?? "?"}${task.enabled ? "" : ", kikapcsolva"})`).join("; ") || "nincs"}`);
      say(`Bekapcsolva: ${state.enabled ? "igen" : "nem"}; következő futás: ${state.nextRun ?? "-"}`);
      return 0;
    }
    case "alkalmaz": {
      const times = applySchedule(deps, rest.length > 0 ? rest : DEFAULT_TIMES);
      say(`Beállítva (hétköznap): ${times.join(", ")}`);
      return 0;
    }
    case "be":
    case "ki":
      setScheduleEnabled(deps, action === "be");
      say(action === "be" ? "Bekapcsolva." : "Kikapcsolva.");
      return 0;
    case "torol":
      removeSchedule(deps);
      say("Az ütemezés törölve.");
      return 0;
    default:
      say("Használat: utemezes allapot | alkalmaz [ÓÓ:PP ...] | be | ki | torol");
      return 1;
  }
}
