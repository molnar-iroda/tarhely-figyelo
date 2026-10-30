// A kezelőfelület indítása: ha már fut egy példány, csak megnyitja a böngészőben,
// különben elindítja a kiszolgálót, és megnyitja a böngészőt.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writeCompanyTemplate } from "../companies.ts";
import { loadConfig } from "../config.ts";
import { describeError } from "../errors.ts";
import { writeFileAtomic } from "../state.ts";
import { defaultOpenPath } from "./api.ts";
import { startUi } from "./server.ts";

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_PORT = 8765;
const PORT_TRIES = 10;

interface Instance {
  readonly port: number;
  readonly token: string;
  readonly pid: number;
}

function instanceFile(configPath: string): string {
  return join(dirname(resolve(configPath)), "felulet.json");
}

function readInstance(configPath: string): Instance | null {
  try {
    const parsed = JSON.parse(readFileSync(instanceFile(configPath), "utf8")) as Partial<Instance>;
    if (typeof parsed.port === "number" && typeof parsed.token === "string" && typeof parsed.pid === "number") {
      return { port: parsed.port, token: parsed.token, pid: parsed.pid };
    }
  } catch {
    // nincs futó példány
  }
  return null;
}

async function isAlive(instance: Instance): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${instance.port}/?k=${instance.token}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(3000)
    });
    return response.status === 302;
  } catch {
    return false;
  }
}

/** Az első indításhoz szükséges fájlok (beállítás-minta, minta céglista), ha még nincsenek. */
export async function ensureStarterFiles(configPath: string): Promise<void> {
  const path = resolve(configPath);
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    copyFileSync(join(PROJECT_DIR, "beallitasok.minta.json"), path);
  }
  try {
    const config = loadConfig(path);
    if (!existsSync(config.companyListPath)) {
      mkdirSync(dirname(config.companyListPath), { recursive: true });
      await writeCompanyTemplate(config.companyListPath);
    }
  } catch {
    // a hibás beállítást a felület mutatja és javíttatja
  }
}

export interface LaunchOptions {
  readonly configPath: string;
  readonly port: number;
  readonly openBrowser: boolean;
}

export async function runUi(options: LaunchOptions): Promise<number> {
  const say = (message: string) => process.stderr.write(`${message}\n`);
  const open = (instance: Instance) => {
    const url = `http://127.0.0.1:${instance.port}/?k=${instance.token}`;
    if (options.openBrowser) {
      defaultOpenPath(url);
    }
    say(`Kezelőfelület: ${url}`);
  };

  const existing = readInstance(options.configPath);
  if (existing !== null && (await isAlive(existing))) {
    open(existing);
    return 0;
  }

  await ensureStarterFiles(options.configPath);
  let ui: Awaited<ReturnType<typeof startUi>> | null = null;
  let stop: () => void = () => {};
  const finished = new Promise<void>((resolveFinished) => {
    stop = resolveFinished;
  });
  for (let offset = 0; offset < PORT_TRIES && ui === null; offset += 1) {
    try {
      ui = await startUi({
        projectDir: PROJECT_DIR,
        cliPath: join(PROJECT_DIR, "src", "cli.ts"),
        configPath: resolve(options.configPath),
        port: options.port + offset,
        onIdle: () => {
          say("Hosszú tétlenség után leállok. Az asztali ikonnal újra megnyitható.");
          stop();
        }
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
        say(`A kezelőfelület nem indult el: ${describeError(error)}`);
        return 1;
      }
    }
  }
  if (ui === null) {
    say("Nem találtam szabad portot a kezelőfelületnek.");
    return 1;
  }
  const instance: Instance = { port: ui.port, token: ui.token, pid: process.pid };
  writeFileAtomic(instanceFile(options.configPath), `${JSON.stringify(instance)}\n`);
  open(instance);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, stop);
  }
  await finished;
  rmSync(instanceFile(options.configPath), { force: true });
  await ui.close();
  return 0;
}
