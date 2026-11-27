// A „csak értesítés” postafiókok új leveleiről: a levél NEM töltődik le (nem
// történik átvétel), csak egy jelzés megy a beállított címzettnek. Minden
// levélről egyszer: az elküldött jelzéseket egy JSON-fájl tartja nyilván.

import { existsSync, readFileSync } from "node:fs";

import type { Config } from "./config.ts";
import { sameMailbox } from "./mailbox-rules.ts";
import type { MailSender } from "./mailer.ts";
import { composeNotice } from "./mailer.ts";
import { writeFileAtomic } from "./state.ts";
import type { HeldLetter } from "./vendor/tarhely-cli/tarhely/inbox.ts";

interface NoticeLog {
  letters: Record<string, { readonly at: string; readonly to: readonly string[] }>;
}

function load(path: string): NoticeLog {
  if (!existsSync(path)) {
    return { letters: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<NoticeLog>;
    return { letters: parsed.letters ?? {} };
  } catch {
    return { letters: {} };
  }
}

export interface NotifyReport {
  readonly sent: number;
  readonly failures: readonly string[];
}

export async function notifyHeldLetters(options: {
  readonly config: Config;
  readonly held: readonly HeldLetter[];
  readonly path: string;
  readonly sender: MailSender;
  readonly log: (message: string) => void;
  readonly now?: () => Date;
}): Promise<NotifyReport> {
  const { config, log } = options;
  const now = options.now ?? (() => new Date());
  const state = load(options.path);
  const failures: string[] = [];
  let sent = 0;
  for (const letter of options.held) {
    const eid = letter.row.eid;
    if (letter.action !== "notify" || eid === null || state.letters[eid] !== undefined) {
      continue;
    }
    const rule = config.mailboxRules.find((item) => item.mode === "ertesites" && sameMailbox(item.mailbox, letter.mailbox));
    const to = rule?.recipients ?? config.defaultRecipients;
    const row = letter.row;
    const mail = composeNotice(to, `Tárhely – értesítés – ${letter.mailbox} – ${row.desc || row.type || "új üzenet"}`.slice(0, 200), [
      `Új üzenet érkezett a(z) ${letter.mailbox} tárhelyére.`,
      "A beállítás szerint a program ezt az üzenetet NEM töltötte le és nem nyitotta meg, tehát az átvétel nem történt meg. Ha kell, a tárhelyen nyisd meg.",
      `Feladó: ${row.senderFull || row.sender}`,
      `Tárgy: ${row.desc}`,
      `Dokumentum típusa: ${row.type}`,
      `Érkezett: ${row.receivedAt}`,
      `Érkeztetési szám: ${eid}`
    ]);
    try {
      await options.sender.send({ ...mail, bcc: config.bcc }, config.smtp.from);
      state.letters[eid] = { at: now().toISOString(), to };
      writeFileAtomic(options.path, `${JSON.stringify(state, null, 2)}\n`);
      sent += 1;
      log(`Értesítés (letöltés nélkül): ${to.join(", ")} – ${letter.mailbox} – ${row.desc || row.type}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${eid} (${letter.mailbox}): ${message}`);
      log(`Értesítés HIBA (${eid}): ${message}`);
    }
  }
  return { sent, failures };
}
