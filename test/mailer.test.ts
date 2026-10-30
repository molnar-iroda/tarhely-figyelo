import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { SMTPServer } from "smtp-server";

import { composeLetterMail, fileSender, smtpSender } from "../src/mailer.ts";
import { FIXTURES, record, tempDir, testConfig } from "./helpers.ts";

interface Received {
  readonly from: string;
  readonly to: string[];
  readonly raw: string;
}

describe("e-mail", () => {
  const received: Received[] = [];
  let server: SMTPServer;
  let port = 0;

  before(async () => {
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS"],
      onData(stream, session, callback) {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          received.push({
            from: session.envelope.mailFrom === false ? "" : session.envelope.mailFrom.address,
            to: session.envelope.rcptTo.map((item) => item.address),
            raw: Buffer.concat(chunks).toString("utf8")
          });
          callback();
        });
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.server.address() as AddressInfo).port;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function letterSetup(maxAttachmentMb = 20) {
    const base = tempDir("email");
    const config = testConfig(base, { maxAttachmentMb, bcc: ["archiv@example.com"] });
    const tarhelyDir = join(config.dataDir, "tarhely");
    const letter = record();
    mkdirSync(join(tarhelyDir, letter.dir), { recursive: true });
    copyFileSync(new URL("felhivas.pdf", FIXTURES), join(tarhelyDir, letter.dir, "felhivas.pdf"));
    return { config, tarhelyDir, letter };
  }

  it("SMTP-n kimegy a könyvelőnek, titkos másolattal és a PDF-fel", async () => {
    const { config, tarhelyDir, letter } = letterSetup();
    const mail = composeLetterMail(letter, config, tarhelyDir);
    await smtpSender({ ...config.smtp, port }, null).send(mail, "Tárhely-figyelő <tarhely@example.com>");

    const message = received.at(-1);
    assert.ok(message);
    assert.equal(message.from, "tarhely@example.com");
    assert.deepEqual(message.to.sort(), ["anna@example.com", "archiv@example.com"]);
    assert.match(message.raw, /Content-Type: application\/pdf; name=felhivas\.pdf/);
    assert.doesNotMatch(message.raw, /^Bcc:/m);
  });

  it("a méretkorlát fölötti csatolmány helyett a gépen lévő helyét írja meg", () => {
    const { config, tarhelyDir, letter } = letterSetup(0.001);
    const mail = composeLetterMail(letter, config, tarhelyDir);
    assert.deepEqual(mail.attachments, []);
    assert.match(mail.text, /nincs csatolva: felhivas\.pdf/);
  });

  it("próbafutásnál .eml fájlba ír", async () => {
    const { config, tarhelyDir, letter } = letterSetup();
    const dir = tempDir("eml");
    await fileSender(dir).send(composeLetterMail(letter, config, tarhelyDir), "tarhely@example.com");
    const files = readdirSync(dir);
    assert.equal(files.length, 1);
    assert.match(files[0] ?? "", /\.eml$/);
    const raw = readFileSync(join(dir, files[0] ?? ""), "utf8");
    assert.match(raw, /^To: anna@example\.com\r$/m);
    assert.match(raw, /filename=felhivas\.pdf/);
  });

  it("csak lejárt határidő: tárgy tartalmazza [LEJÁRT HATÁRIDŐ?], szöveg tartalmazza LEJÁRT hivatkozott határidő", () => {
    const { config, tarhelyDir } = letterSetup();
    const letter = record({ deadline: null, deadlineExpired: true });
    const mail = composeLetterMail(letter, config, tarhelyDir);
    assert.match(mail.subject, /^\[LEJÁRT HATÁRIDŐ\?\]/);
    assert.match(mail.text, /LEJÁRT hivatkozott határidő/);
  });

  it("munkaszüneti napra közölt határidő: a tárgy és a szöveg a következő munkanapot is mutatja", () => {
    const { config, tarhelyDir } = letterSetup();
    const letter = record({ deadline: "2026-10-31", deadlineNextWorkday: "2026-11-02" });
    const mail = composeLetterMail(letter, config, tarhelyDir);
    assert.match(mail.subject, /\(határidő: 2026-10-31, következő munkanap: 2026-11-02\)$/);
    assert.match(mail.text, /munkaszüneti napra esik, a következő munkanap: 2026-11-02/);
    const plain = composeLetterMail(record({ deadline: "2026-11-20" }), config, tarhelyDir);
    assert.doesNotMatch(plain.subject, /következő munkanap/);
  });

  it("OCR-ből olvasott határidő: a tárgy [OCR] jelzést kap, a szöveg ellenőrzésre szólít", () => {
    const { config, tarhelyDir } = letterSetup();
    const mail = composeLetterMail(record({ deadline: "2026-11-20", deadlineOcr: true }), config, tarhelyDir);
    assert.match(mail.subject, /^\[OCR\] /u);
    assert.match(mail.text, /SZKENNELT irat, OCR-rel olvasva/u);
    assert.doesNotMatch(composeLetterMail(record({ deadline: "2026-11-20" }), config, tarhelyDir).subject, /OCR/u);
  });

  it("jövőbeli és lejárt határidő: szöveg mindkettőre utal", () => {
    const { config, tarhelyDir } = letterSetup();
    const letter = record({ deadline: "2026-11-20", deadlineExpired: true });
    const mail = composeLetterMail(letter, config, tarhelyDir);
    assert.match(mail.text, /2026-11-20/);
    assert.match(mail.text, /lejárt hivatkozott határidő is szerepel/);
  });
});
