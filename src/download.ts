// A tárhely-portál elérése a beemelt tarhely-cli kóddal: Ügyfélkapu+ belépés,
// a postafiókok listája és az új levelek letöltése. Ezt a modult a CLI csak
// akkor tölti be, ha tényleg a portálhoz kell nyúlni.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";

import { stripAccents } from "./companies.ts";
import type { Log } from "./runlog.ts";
import { keyring } from "./secrets.ts";
import { createReporter } from "./vendor/tarhely-cli/report.ts";
import { withSession } from "./vendor/tarhely-cli/session.ts";
import { type CredentialStore, createCredentialStore } from "./vendor/tarhely-cli/store/credentials.ts";
import type { MailboxRef } from "./vendor/tarhely-cli/tarhely/api.ts";
import {
  type DownloadResult,
  downloadNewLetters,
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

const fold = (value: string) => stripAccents(value).toLowerCase();

/** A beállításban kihagyottként megadott (névrészlet) postafiókok nélkül. */
export function selectMailboxes(
  mailboxes: readonly MailboxRef[],
  skip: readonly string[]
): MailboxRef[] {
  const patterns = skip.map(fold);
  return mailboxes.filter((mailbox) => !patterns.some((pattern) => fold(mailbox.name).includes(pattern)));
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
    readonly since: string | null;
    readonly max: number;
    readonly skipMailboxes: readonly string[];
  }
): Promise<DownloadResult> {
  const reporter = reporterFor(options);
  return withSession(
    { store: ugyfelkapuStore(), reporter, headed: options.headed },
    async (session) => {
      const mailboxes = selectMailboxes(session.mailboxes, options.skipMailboxes);
      options.log(
        `Postafiókok: ${session.mailboxes.length} elérhető, ebből ${mailboxes.length} feldolgozandó.`
      );
      return downloadNewLetters(session, {
        mailboxes,
        since: options.since,
        outDir: options.tarhelyDir,
        max: options.max,
        extract: true,
        step: reporter.step
      });
    }
  );
}

/** Belépés és listázás letöltés nélkül: semmit nem vesz át a tárhelyről. */
export async function listPortal(
  options: PortalOptions & { readonly tarhelyDir: string }
): Promise<{ mailboxes: MailboxRef[]; letters: ListedLetter[] }> {
  const reporter = reporterFor(options);
  return withSession(
    { store: ugyfelkapuStore(), reporter, headed: options.headed },
    async (session) => {
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
