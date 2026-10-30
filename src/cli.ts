// Parancssori belépési pont.

import { parseArgs } from "node:util";

import { defaultConfigPath, loadConfig } from "./config.ts";
import { isIsoDate } from "./dates.ts";
import { describeError } from "./errors.ts";
import { runOnce } from "./run.ts";
import { createRunLog } from "./runlog.ts";
import { runSchedule } from "./schedule-cli.ts";
import { runCheck, runMailboxList, runSetup, runTestEmail } from "./setup.ts";

const HELP = `Tárhely-figyelő: a Cégkapu-tárhelyek új leveleit letölti, elküldi a cég
felelős könyvelőjének, és Excel-naplót vezet róluk.

Parancsok:
  beallitas                   első beállítás (belépő, SMTP-jelszó, mintafájlok)
  ellenorzes                  beállítások, céglista és titkok ellenőrzése
  teszt-email <cím>           próbalevél küldése
  postafiokok                 belépés és a postafiókok listája, letöltés NÉLKÜL
  futtatas                    letöltés, e-mailek, napló
  felulet                     a kezelőfelület megnyitása a böngészőben
  utemezes <parancs>          automatikus futás (Windows Feladatütemező / macOS launchd):
                              allapot | alkalmaz [ÓÓ:PP ...] | be | ki | torol

A futtatas kapcsolói:
  --proba                     e-mail helyett .eml fájl, külön próbanapló
  --since ÉÉÉÉ-HH-NN          csak az ekkortól érkezett levelek
  --mind                      minden levél, dátumkorlát nélkül
  --csak-feldolgozas          nincs belépés, csak a már letöltöttek feldolgozása
  --lathato                   látható böngészőablakban fut
  --debug                     hiba esetén képernyőkép az adatmappába

Közös kapcsoló:
  --beallitasok <fájl>        beállításfájl (alapból ${defaultConfigPath()})
`;

async function main(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      beallitasok: { type: "string", default: defaultConfigPath() },
      port: { type: "string" },
      "nincs-bongeszo": { type: "boolean", default: false },
      proba: { type: "boolean", default: false },
      since: { type: "string" },
      mind: { type: "boolean", default: false },
      "csak-feldolgozas": { type: "boolean", default: false },
      lathato: { type: "boolean", default: false },
      debug: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false }
    }
  });
  const command = positionals[0];
  if (values.help || command === undefined) {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === "beallitas") {
    return runSetup(values.beallitasok);
  }
  if (command === "utemezes") {
    return runSchedule(positionals.slice(1));
  }
  if (command === "felulet") {
    const { DEFAULT_PORT, runUi } = await import("./ui/launch.ts");
    const port = values.port === undefined ? DEFAULT_PORT : Number(values.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error("A --port 1024 és 65535 közötti szám legyen.");
    }
    return runUi({ configPath: values.beallitasok, port, openBrowser: !values["nincs-bongeszo"] && !process.env.TARHELY_NINCS_BONGESZO });
  }

  const config = loadConfig(values.beallitasok);
  const log = createRunLog(command === "futtatas" ? config.dataDir : null);
  switch (command) {
    case "ellenorzes":
      return runCheck(config, log);
    case "teszt-email":
      return runTestEmail(config, log, positionals[1]);
    case "postafiokok":
      return runMailboxList(config, log, values.lathato);
    case "futtatas": {
      if (values.since !== undefined && !isIsoDate(values.since)) {
        throw new Error(`A --since ÉÉÉÉ-HH-NN alakú legyen (most: ${values.since}).`);
      }
      return runOnce({
        config,
        log,
        proba: values.proba,
        skipDownload: values["csak-feldolgozas"],
        since: values.since ?? null,
        all: values.mind,
        headed: values.lathato,
        debug: values.debug
      });
    }
    default:
      process.stderr.write(`Ismeretlen parancs: ${command}\n\n${HELP}`);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`Hiba: ${describeError(error)}\n`);
    process.exitCode = 1;
  }
);
