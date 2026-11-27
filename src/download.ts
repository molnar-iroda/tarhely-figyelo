// A tárhely-portál elérése a beemelt tarhely-cli kóddal: Ügyfélkapu+ belépés,
// a postafiókok listája és az új levelek letöltése. Ezt a modult a CLI csak
// akkor tölti be, ha tényleg a portálhoz kell nyúlni.

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";

import type { Config } from "./config.ts";
import { matchingType, planMailboxes } from "./mailbox-rules.ts";
import type { Log } from "./runlog.ts";
import { keyring } from "./secrets.ts";
import { writeFileAtomic } from "./state.ts";
import { createReporter } from "./vendor/tarhely-cli/report.ts";
import { withSession } from "./vendor/tarhely-cli/session.ts";
import { type CredentialStore, createCredentialStore } from "./vendor/tarhely-cli/store/credentials.ts";
import type { LetterRow, MailboxRef } from "./vendor/tarhely-cli/tarhely/api.ts";
import {
  type DownloadResult,
  downloadNewLetters,
  type RowDecision,
  type ListedLetter,
  listLetters
} from "./vendor/tarhely-cli/tarhely/inbox.ts";

export interface PortalOptions {
  readonly headed: boolean;
  readonly debugDir: string | null;
  readonly log: Log;
}

export function ugyfelkapuStore(): CredentialStore {
  return createCredentialStore(process.env, keyring("ugyfelkapu"));
}

/** A postafiókok listája a kezelőfelület „Postafiókok” lapjához (minden belépéskor frissül). */
export interface MailboxCache {
  readonly updatedAt: string;
  readonly mailboxes: readonly { readonly name: string; readonly index: number }[];
}

export const MAILBOX_CACHE_FILE = "postafiokok.json";

export function writeMailboxCache(dataDir: string, mailboxes: readonly MailboxRef[], now = new Date()): void {
  const cache: MailboxCache = {
    updatedAt: now.toISOString(),
    mailboxes: mailboxes.map((mailbox) => ({ name: mailbox.name, index: mailbox.index }))
  };
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  writeFileAtomic(join(dataDir, MAILBOX_CACHE_FILE), `${JSON.stringify(cache, null, 2)}\n`);
}

/** A feldolgozandó (nem kihagyott) postafiókok. */
export function selectMailboxes(
  mailboxes: readonly MailboxRef[],
  config: Pick<Config, "mailboxRules" | "skipMailboxes">
): MailboxRef[] {
  return planMailboxes(mailboxes, config)
    .filter((plan) => plan.mode !== "kihagy")
    .map((plan) => plan.mailbox);
}

// A tarhely-cli lépésnaplóját a saját futásnaplónkba tereljük.
function reporterFor(options: PortalOptions) {
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      for (const line of String(chunk).split("\n")) {
        if (line.trim() !== "") {
          options.log(`  ${line}`);
        }
      }
      callback();
    }
  });
  return createReporter({ json: false, debugDir: options.debugDir, stdout: stream, stderr: stream });
}

export async function downloadFromPortal(
  options: PortalOptions & {
    readonly tarhelyDir: string;
    readonly dataDir: string;
    readonly since: string | null;
    readonly max: number;
    readonly config: Pick<Config, "mailboxRules" | "skipMailboxes" | "skipTypes">;
  }
): Promise<DownloadResult> {
  const reporter = reporterFor(options);
  return withSession(
    { store: ugyfelkapuStore(), reporter, headed: options.headed },
    async (session) => {
      writeMailboxCache(options.dataDir, session.mailboxes);
      const plans = planMailboxes(session.mailboxes, options.config);
      const active = plans.filter((plan) => plan.mode !== "kihagy");
      const notifyOnly = new Set(active.filter((plan) => plan.mode === "ertesites").map((plan) => plan.mailbox.addressId));
      options.log(
        `Postafiókok: ${session.mailboxes.length} elérhető, ebből ${active.length} feldolgozandó` +
          (notifyOnly.size > 0 ? ` (${notifyOnly.size} csak értesítéssel, letöltés nélkül)` : "") +
          "."
      );
      const decide = (mailbox: MailboxRef, row: LetterRow): RowDecision => {
        if (notifyOnly.has(mailbox.addressId)) {
          return { action: "notify", reason: "csak értesítés (postafiók-beállítás)" };
        }
        const pattern = matchingType(options.config.skipTypes, row.type, row.desc);
        return pattern === undefined
          ? { action: "download" }
          : { action: "skip", reason: `kihagyott típus („${pattern}”)` };
      };
      return downloadNewLetters(session, {
        mailboxes: active.map((plan) => plan.mailbox),
        since: options.since,
        outDir: options.tarhelyDir,
        max: options.max,
        extract: true,
        step: reporter.step,
        decide
      });
    }
  );
}

/** Belépés és listázás letöltés nélkül: semmit nem vesz át a tárhelyről. */
export async function listPortal(
  options: PortalOptions & { readonly tarhelyDir: string; readonly dataDir: string }
): Promise<{ mailboxes: MailboxRef[]; letters: ListedLetter[] }> {
  const reporter = reporterFor(options);
  return withSession(
    { store: ugyfelkapuStore(), reporter, headed: options.headed },
    async (session) => {
      writeMailboxCache(options.dataDir, session.mailboxes);
      const letters = await listLetters(session, {
        mailboxes: session.mailboxes,
        since: null,
        outDir: existsSync(join(options.tarhelyDir, "index.jsonl")) ? options.tarhelyDir : null,
        step: reporter.step
      });
      return { mailboxes: [...session.mailboxes], letters };
    }
  );
}
