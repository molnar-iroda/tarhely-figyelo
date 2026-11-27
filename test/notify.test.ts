import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { OutgoingMail } from "../src/mailer.ts";
import { notifyHeldLetters } from "../src/notify.ts";
import type { HeldLetter } from "../src/vendor/tarhely-cli/tarhely/inbox.ts";
import { tempDir, testConfig } from "./helpers.ts";

const row = (eid: string) => ({
  eid,
  sender: "NAV",
  senderFull: "Nemzeti Adó- és Vámhivatal",
  recipient: "",
  type: "Végzés",
  desc: "Ellenőrzés értesítése",
  receivedAt: "2026-11-27 10:00",
  receivedOn: "2026-11-27"
});

describe("csak értesítés", () => {
  it("levelenként egyszer jelez, a titkos másolattal, letöltés nélkül", async () => {
    const base = tempDir("ertesites");
    const config = testConfig(base, {
      bcc: ["juli@example.com"],
      mailboxRules: [{ mailbox: "22690692 - AB Corpus", mode: "ertesites", recipients: ["ceg@example.com"] }]
    });
    const held = [
      { mailbox: "AB Corpus 22690692", row: row("E1"), action: "notify", reason: "" },
      { mailbox: "AB Corpus 22690692", row: row("E2"), action: "skip", reason: "" }
    ] as unknown as HeldLetter[];
    const sent: OutgoingMail[] = [];
    const sender = { async send(mail: OutgoingMail) { sent.push(mail); } };
    const path = join(config.dataDir, "ertesitesek.json");
    const first = await notifyHeldLetters({ config, held, path, sender, log: () => {} });
    assert.equal(first.sent, 1);
    assert.deepEqual(sent[0]?.to, ["ceg@example.com"]);
    assert.deepEqual(sent[0]?.bcc, ["juli@example.com"]);
    assert.match(sent[0]?.text ?? "", /NEM töltötte le/);
    const second = await notifyHeldLetters({ config, held, path, sender, log: () => {} });
    assert.equal(second.sent, 0);
    assert.equal(sent.length, 1);
  });
});
