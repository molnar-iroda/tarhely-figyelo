// Melyik postafiókkal mit csináljon a program, és melyik üzenettípus mire
// illeszkedik. A portál a postafiókot „Cégnév 12345678” vagy „12345678 (Cégnév)”
// alakban mutatja, a felhasználó viszont gyakran „12345678 - Teljes cégnév”
// alakban írja be: ezért a postafiókot elsősorban a törzsszáma azonosítja.

import { stripAccents } from "./companies.ts";
import type { Config, MailboxMode } from "./config.ts";

export interface MailboxLike {
  readonly name: string;
}

export interface MailboxPlan<T extends MailboxLike> {
  readonly mailbox: T;
  readonly mode: MailboxMode;
  /** Üres: a céglista dönt (letöltésnél). */
  readonly recipients: readonly string[];
  /** Miért ez a mód (a naplóhoz). */
  readonly reason: string;
}

const TORZSSZAM = /(?<!\d)(\d{8})(?:-\d-\d{2})?(?!\d)/;

const fold = (value: string) => stripAccents(value).toLowerCase().replace(/\s+/g, " ").trim();

/** Ékezet, kis-nagybetű, szóköz és írásjel nélküli alak: „Feladási igazolás” = „FeladasiIgazolas”. */
export const compact = (value: string) => stripAccents(value).toLowerCase().replace(/[^a-z0-9]/g, "");

/** A postafiók azonosítója: a nevében álló törzsszám, ennek hiányában a név. */
export function mailboxKey(name: string): string {
  const match = TORZSSZAM.exec(name);
  return match?.[1] ?? fold(name);
}

/** Ugyanarra a postafiókra utal-e a két név (törzsszám vagy pontos név szerint). */
export function sameMailbox(a: string, b: string): boolean {
  return mailboxKey(a) === mailboxKey(b);
}

/** A régi „kihagyott_postafiokok” egy sora: törzsszám esetén azzal, különben névrészlettel illeszt. */
export function matchesSkipPattern(mailboxName: string, pattern: string): boolean {
  const taxNumber = TORZSSZAM.exec(pattern)?.[1];
  if (taxNumber !== undefined) {
    return mailboxKey(mailboxName) === taxNumber;
  }
  const needle = fold(pattern);
  return needle !== "" && fold(mailboxName).includes(needle);
}

/** Az üzenettípus vagy a leírás illeszkedik-e valamelyik mintára (ékezet- és szóközfüggetlenül). */
export function matchingType(patterns: readonly string[], type: string, desc: string): string | undefined {
  const haystack = compact(`${type} ${desc}`);
  return patterns.find((pattern) => {
    const needle = compact(pattern);
    return needle !== "" && haystack.includes(needle);
  });
}

type RuleConfig = Pick<Config, "mailboxRules" | "skipMailboxes">;

/** Postafiókonként a mód: a „Postafiókok” lap szabálya, ennek hiányában a régi kihagyási lista. */
export function planMailboxes<T extends MailboxLike>(mailboxes: readonly T[], config: RuleConfig): MailboxPlan<T>[] {
  return mailboxes.map((mailbox) => {
    const rule = config.mailboxRules.find((item) => sameMailbox(item.mailbox, mailbox.name));
    if (rule !== undefined) {
      return { mailbox, mode: rule.mode, recipients: rule.recipients, reason: "postafiók-beállítás" };
    }
    const pattern = config.skipMailboxes.find((item) => matchesSkipPattern(mailbox.name, item));
    if (pattern !== undefined) {
      return { mailbox, mode: "kihagy", recipients: [], reason: `kihagyott postafiók („${pattern}”)` };
    }
    return { mailbox, mode: "letoltes", recipients: [], reason: "alapértelmezés" };
  });
}

/** A letöltés utáni feldolgozáshoz: a postafiókra beállított címzettek, ha vannak. */
export function recipientsFor(mailboxName: string, config: RuleConfig): readonly string[] {
  const rule = config.mailboxRules.find((item) => item.mode === "letoltes" && sameMailbox(item.mailbox, mailboxName));
  return rule?.recipients ?? [];
}
