// Az e-mail összeállítása és elküldése. Élesben SMTP-n megy ki; próbafutásnál
// a kész levél .eml fájlba kerül, így Outlookban megnyitva pontosan látszik,
// mit kapna a könyvelő.

import { statSync } from "node:fs";
import { basename, join } from "node:path";

import nodemailer from "nodemailer";

import type { Config, SmtpConfig } from "./config.ts";
import type { LetterRecord } from "./state.ts";
import { writeFileAtomic } from "./state.ts";
import { formatLocalDateTime } from "./time.ts";

export interface OutgoingMail {
  readonly to: readonly string[];
  readonly bcc: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly attachments: readonly { readonly filename: string; readonly path: string }[];
}

export interface MailSender {
  send(mail: OutgoingMail, from: string): Promise<void>;
}

// A tárhelyről jövő aláírt konténerek technikai fájljai, amik a könyvelőnek
// nem kellenek.
const TECHNICAL_FILE = /(^|[\\/])(META-INF[\\/]|mimetype$)/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * A csatolmányok a méretkorlátig; ami nem fér bele, az kimarad, és a levél
 * megmondja, hol találja meg a könyvelő a gépen.
 */
function pickAttachments(
  record: LetterRecord,
  letterDir: string,
  maxBytes: number
): { attachments: { filename: string; path: string }[]; skipped: string[] } {
  const attachments: { filename: string; path: string }[] = [];
  const skipped: string[] = [];
  let total = 0;
  for (const file of record.files.filter((name) => !TECHNICAL_FILE.test(name))) {
    const path = join(letterDir, file);
    let size: number;
    try {
      size = statSync(path).size;
    } catch {
      skipped.push(`${file} (nem található)`);
      continue;
    }
    if (total + size > maxBytes) {
      skipped.push(`${file} (${megabytes(size)})`);
      continue;
    }
    total += size;
    attachments.push({ filename: basename(file), path });
  }
  return { attachments, skipped };
}

export function composeLetterMail(
  record: LetterRecord,
  config: Config,
  tarhelyDir: string
): OutgoingMail {
  const letterDir = join(tarhelyDir, record.dir);
  const { attachments, skipped } = pickAttachments(
    record,
    letterDir,
    config.maxAttachmentMb * 1024 * 1024
  );
  const matched = record.accountant !== "";
  const who = record.company || record.mailbox;
  const deadlineText =
    record.deadline === null
      ? record.deadlineExpired === true
        ? "nincs jövőbeli határidő, de LEJÁRT hivatkozott határidő szerepel a dokumentumban (ellenőrizendő)"
        : "nem találtam a dokumentumban"
      : `${record.deadline}${record.deadlineComputed ? " (számított, ellenőrizendő)" : ""}` +
        (record.deadlineNextWorkday === undefined
          ? ""
          : ` – munkaszüneti napra esik, a következő munkanap: ${record.deadlineNextWorkday}`) +
        (record.deadlineExpired === true ? " – lejárt hivatkozott határidő is szerepel" : "") +
        (record.deadlineOcr === true ? " – SZKENNELT irat, OCR-rel olvasva: a dátumot az eredetin ellenőrizd!" : "");

  const subject = [
    record.deadlineExpired === true ? "[LEJÁRT HATÁRIDŐ?] " : "",
    record.deadlineOcr === true ? "[OCR] " : "",
    matched ? "" : "[NINCS FELELŐS] ",
    `Tárhely – ${who} – ${record.subject || record.type || "új dokumentum"}`,
    record.deadline === null
      ? ""
      : ` (határidő: ${record.deadline}${record.deadlineNextWorkday === undefined ? "" : `, következő munkanap: ${record.deadlineNextWorkday}`})`
  ]
    .join("")
    .slice(0, 200);

  const rows: [string, string][] = [
    ["Cég", record.taxNumber ? `${who} (${record.taxNumber})` : who],
    ["Felelős könyvelő", matched ? record.accountant : "— nincs a céglistában —"],
    ["Feladó", record.sender],
    ["Tárgy", record.subject],
    ["Dokumentum típusa", record.type],
    ["Érkezett", record.receivedAt],
    ["Letöltve", formatLocalDateTime(new Date(record.downloadedAt))],
    ["Érkeztetési szám", record.eid],
    ["Határidő", deadlineText]
  ];
  if (record.deadlineNote !== "") {
    rows.push(["Határidő forrása", record.deadlineNote]);
  }

  const intro = matched
    ? `Új dokumentum érkezett a(z) ${who} Cégkapu-tárhelyére.`
    : `Ezt a dokumentumot nem tudtam céghez rendelni (postafiók: ${record.mailbox}). Kérlek, továbbítsd a felelős könyvelőnek, és vedd fel a céget a céglistába.`;
  const notes = [
    attachments.length > 0
      ? `Csatolva: ${attachments.map((item) => item.filename).join(", ")}.`
      : "A dokumentum nincs csatolva.",
    skipped.length > 0
      ? `Méretkorlát vagy hiba miatt nincs csatolva: ${skipped.join(", ")}. Helye: ${letterDir}`
      : "",
    "A tárhelyről való letöltés átvételnek minősül: a napokban megadott határidők a letöltés napjától futhatnak.",
    "A határidőt automatikus szövegfelismerés találta meg; mindig ellenőrizd magában a dokumentumban."
  ].filter((line) => line !== "");

  const labelWidth = Math.max(...rows.map(([label]) => label.length)) + 2;
  const text = [
    intro,
    "",
    ...rows.map(([label, value]) => `${`${label}:`.padEnd(labelWidth)}${value}`),
    "",
    ...notes,
    "",
    "-- ",
    "Ezt a levelet a tárhely-figyelő automatikusan küldte."
  ].join("\n");

  const html = `<p>${escapeHtml(intro)}</p>
<table cellpadding="4" style="border-collapse:collapse">
${rows
  .map(
    ([label, value]) =>
      `<tr><th align="left" valign="top" style="padding-right:12px">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
  )
  .join("\n")}
</table>
${notes.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n")}
<p style="color:#666">Ezt a levelet a tárhely-figyelő automatikusan küldte.</p>`;

  return {
    to: record.recipients,
    bcc: config.bcc,
    subject,
    text,
    html,
    attachments
  };
}

export function composeNotice(
  to: readonly string[],
  subject: string,
  lines: readonly string[]
): OutgoingMail {
  const text = [...lines, "", "-- ", "Ezt a levelet a tárhely-figyelő automatikusan küldte."].join(
    "\n"
  );
  return {
    to,
    bcc: [],
    subject,
    text,
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n"),
    attachments: []
  };
}

function toMessage(mail: OutgoingMail, from: string) {
  return {
    from,
    to: [...mail.to],
    bcc: [...mail.bcc],
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: mail.attachments.map((item) => ({ filename: item.filename, path: item.path }))
  };
}

export function smtpSender(smtp: SmtpConfig, password: string | null): MailSender {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user === "" ? {} : { auth: { user: smtp.user, pass: password ?? "" } })
  });
  return {
    async send(mail, from) {
      await transport.sendMail(toMessage(mail, from));
    }
  };
}

/** Próbafutáshoz: a levelet .eml fájlba írja ahelyett, hogy elküldené. */
export function fileSender(dir: string): MailSender {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "windows"
  });
  let counter = 0;
  return {
    async send(mail, from) {
      const info = await transport.sendMail(toMessage(mail, from));
      counter += 1;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const name = `${stamp}-${counter}-${mail.subject.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.eml`;
      writeFileAtomic(join(dir, name), info.message as Buffer);
    }
  };
}
