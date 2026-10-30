// Futásnapló: minden üzenet a konzolra és a havi naplófájlba
// (`<adatmappa>/naplo/ÉÉÉÉ-HH.log`), hogy az ütemezett futások utólag is
// visszakereshetők legyenek.

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { formatLocalDateTime } from "./time.ts";

export type Log = (message: string) => void;

export function createRunLog(dataDir: string | null): Log {
  let file: string | null = null;
  if (dataDir !== null) {
    const dir = join(dataDir, "naplo");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    file = join(dir, `${formatLocalDateTime(new Date()).slice(0, 7)}.log`);
  }
  return (message) => {
    const line = `${formatLocalDateTime(new Date())}  ${message}`;
    process.stderr.write(`${line}\n`);
    if (file !== null) {
      try {
        appendFileSync(file, `${line}\n`, { encoding: "utf8", mode: 0o600 });
      } catch {
        // a naplófájl hibája ne állítsa meg a futást
      }
    }
  };
}
