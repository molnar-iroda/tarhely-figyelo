// A legutóbbi futás összefoglalója egy kis JSON-fájlban (`<adatmappa>/utolso-futas.json`):
// ebből látja a kezelőfelület, mikor és hogyan futott utoljára a program.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { writeFileAtomic } from "./state.ts";

export interface RunStatus {
  readonly mode: "futtatas" | "proba" | "feldolgozas";
  readonly startedAt: string;
  /** Null: még fut (vagy váratlanul megszakadt). */
  readonly finishedAt: string | null;
  readonly exitCode: number | null;
  readonly newLetters: number;
  readonly emailed: number;
  readonly unmatched: number;
  readonly skipped: number;
  readonly problems: readonly string[];
}

const FILE = "utolso-futas.json";

export function writeRunStatus(dataDir: string, status: RunStatus): void {
  try {
    writeFileAtomic(join(dataDir, FILE), `${JSON.stringify(status, null, 2)}\n`);
  } catch {
    // az állapotfájl hibája ne állítsa meg a futást
  }
}

export function readRunStatus(dataDir: string): RunStatus | null {
  try {
    const parsed = JSON.parse(readFileSync(join(dataDir, FILE), "utf8")) as Partial<RunStatus>;
    if (typeof parsed.startedAt !== "string") {
      return null;
    }
    return {
      mode: parsed.mode ?? "futtatas",
      startedAt: parsed.startedAt,
      finishedAt: parsed.finishedAt ?? null,
      exitCode: parsed.exitCode ?? null,
      newLetters: parsed.newLetters ?? 0,
      emailed: parsed.emailed ?? 0,
      unmatched: parsed.unmatched ?? 0,
      skipped: parsed.skipped ?? 0,
      problems: parsed.problems ?? []
    };
  } catch {
    return null;
  }
}
