import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanOcrText, fileTextDetail, textOfFiles } from "../src/letter-text.ts";
import { FIXTURES, tempDir } from "./helpers.ts";

function fixture(name: string): string {
  return fileURLToPath(new URL(name, FIXTURES));
}

describe("irat szövege", () => {
  it("szöveges PDF-nél nincs OCR", async () => {
    const result = await fileTextDetail(fixture("felhivas.pdf"));
    assert.equal(result.ocr, false);
    assert.match(result.text, /FELHÍVÁS/u);
  });

  it("szkennelt (képes) PDF-et helyi OCR-rel olvassa, ékezetesen", async () => {
    const result = await fileTextDetail(fixture("szkennelt.pdf"));
    assert.equal(result.ocr, true);
    assert.match(result.text, /határideje: 2026\. november 20\./u);
    assert.match(result.text, /Példa Kft\./u);
  });

  it("képfájlt (jpg) is OCR-rel olvas", async () => {
    const result = await fileTextDetail(fixture("szkennelt.jpg"));
    assert.equal(result.ocr, true);
    assert.match(result.text, /2026\. november 20\./u);
  });

  it("a textOfFiles jelzi, ha OCR-t használt, és a hibás fájl nem állítja meg", async () => {
    const mixed = await textOfFiles([fixture("felhivas.pdf"), fixture("szkennelt.pdf"), fixture("nincs.pdf")]);
    assert.equal(mixed.ocr, true);
    assert.equal(mixed.errors.length, 1);
    assert.match(mixed.text, /FELHÍVÁS/u);
    const plain = await textOfFiles([fixture("felhivas.pdf")]);
    assert.equal(plain.ocr, false);
  });

  // Szöveges 1. oldal + üres 2. oldal (pl. üres hátoldal) minimális PDF-ben.
  function mixedPdf(blankPages = 1, line = "A fellebbezes hatarideje: 2026. november 20. a kezbesitestol szamitva."): string {
    const dir = tempDir("pdf");
    const path = join(dir, "vegyes.pdf");
    const text = `BT /F1 12 Tf 72 700 Td (${line}) Tj ET`;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [3 0 R ${Array.from({ length: blankPages }, (_, i) => `${6 + i} 0 R`).join(" ")}] /Count ${1 + blankPages} >>`,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      ...Array.from({ length: blankPages }, () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>")
    ];
    let body = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((object, index) => {
      offsets.push(body.length);
      body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = body.length;
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    writeFileSync(path, body, "latin1");
    return path;
  }

  it("üres oldal miatt nem jelez hamis OCR-t, a szöveg megmarad", async () => {
    const result = await fileTextDetail(mixedPdf());
    assert.equal(result.ocr, false);
    assert.equal(result.ocrIncomplete, false);
    assert.match(result.text, /hatarideje: 2026\. november 20\./u);
  });

  it("az OCR hibája nem veszíti el a szöveges oldalak szövegét, és jelez", async () => {
    const broken = async () => {
      throw new Error("szimulált: az OCR nem indul");
    };
    const result = await textOfFiles([mixedPdf()], broken);
    assert.match(result.text, /hatarideje: 2026\. november 20\./u);
    assert.equal(result.ocrIncomplete, true);
    assert.equal(result.ocr, false);
    assert.match(result.errors.join("\n"), /OCR hiba \(2\. oldal\): szimulált/u);
    const image = await textOfFiles([fixture("szkennelt.jpg")], broken);
    assert.equal(image.ocrIncomplete, true);
    assert.equal(image.errors.length, 1);
  });

  const emptyOcr = async () => ({ recognize: async () => "", close: async () => {} });

  it("olvashatatlan (az OCR-nek üres) kép vagy oldal hiányos-jelzést kap, az üres lap nem", async () => {
    const scannedPdf = await fileTextDetail(fixture("szkennelt.pdf"), emptyOcr);
    assert.equal(scannedPdf.ocr, false);
    assert.equal(scannedPdf.ocrIncomplete, true);
    const scannedImage = await fileTextDetail(fixture("szkennelt.jpg"), emptyOcr);
    assert.equal(scannedImage.ocrIncomplete, true);
    const blankBack = await fileTextDetail(mixedPdf(), emptyOcr);
    assert.equal(blankBack.ocrIncomplete, false);
    assert.match(blankBack.text, /hatarideje: 2026\. november 20\./u);
  });

  it("9-nél több üres lap a szöveges PDF végén nem ad hamis hiányos-jelzést", async () => {
    const result = await fileTextDetail(mixedPdf(10), emptyOcr);
    assert.equal(result.ocrIncomplete, false);
    assert.equal(result.ocr, false);
  });

  it("egyetlen rövid sort tartalmazó, az OCR-nek olvashatatlan oldal is hiányos-jelzést kap", async () => {
    const result = await fileTextDetail(mixedPdf(0, "Hatarido 2026.11.20"), emptyOcr);
    assert.equal(result.ocrIncomplete, true);
  });

  it("az OCR tipikus dátum-tévesztéseit javítja, a többi szöveget nem bántja", () => {
    assert.equal(cleanOcrText("határideje: 2026, november 20."), "határideje: 2026. november 20.");
    assert.equal(cleanOcrText("2O26. május 3."), "2026. május 3.");
    assert.equal(cleanOcrText("l5 napon belül"), "15 napon belül");
    assert.equal(cleanOcrText("2026.1O.01."), "2026.10.01.");
    assert.equal(cleanOcrText("Olvasd el az Október 3. rendeletet, 10 nap"), "Olvasd el az Október 3. rendeletet, 10 nap");
    assert.equal(cleanOcrText("Ügyszám: 2026/12-3, Orbán Oszkár 5 órakor"), "Ügyszám: 2026/12-3, Orbán Oszkár 5 órakor");
  });
});
