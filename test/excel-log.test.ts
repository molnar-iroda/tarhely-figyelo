import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import ExcelJS from "exceljs";

import { cellText } from "../src/companies.ts";
import { LOG_COLUMNS, LogLockedError, upsertLogRows } from "../src/excel-log.ts";
import { record, tempDir } from "./helpers.ts";

async function readSheet(path: string): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.getWorksheet("Letöltések");
  assert.ok(sheet);
  return sheet;
}

describe("Excel-napló", () => {
  it("új fájl: fejléc és sorok, dátumok helyi idő szerint", async () => {
    const path = join(tempDir("naplo"), "letoltesek.xlsx");
    await upsertLogRows(path, [
      record(),
      record({ eid: "B2", accountant: "", company: "", mailbox: "Ismeretlen", deadline: null })
    ]);
    const sheet = await readSheet(path);

    assert.deepEqual(
      LOG_COLUMNS.map((_, index) => cellText(sheet.getRow(1).getCell(index + 1).value)),
      LOG_COLUMNS.map((column) => column.header)
    );
    const row = sheet.getRow(2);
    // A falióra-időt UTC-ként kódoljuk: az Excel 09:15:00-t mutat.
    assert.deepEqual(row.getCell(1).value, new Date(Date.UTC(2026, 9, 27, 9, 15, 0)));
    assert.equal(row.getCell(1).numFmt, "yyyy-mm-dd hh:mm:ss");
    assert.equal(cellText(row.getCell(2).value), "Minta Anna");
    assert.equal(cellText(row.getCell(3).value), "Példa Kft.");
    assert.equal(cellText(row.getCell(4).value), "Felhívás");
    assert.deepEqual(row.getCell(5).value, new Date(Date.UTC(2026, 10, 20)));
    assert.match(cellText(row.getCell(13).value), /^Elküldve 2026-10-27 09:16/);

    const unmatched = sheet.getRow(3);
    assert.equal(cellText(unmatched.getCell(2).value), "— nincs a céglistában —");
    assert.equal(cellText(unmatched.getCell(3).value), "Ismeretlen");
    assert.equal(cellText(unmatched.getCell(5).value), "");
  });

  it("meglévő sort frissít, a kézzel felvett oszlopot megtartja", async () => {
    const path = join(tempDir("naplo"), "letoltesek.xlsx");
    await upsertLogRows(path, [record({ emailStatus: "hiba", emailError: "SMTP hiba" })]);

    // A könyvelő felvesz egy saját oszlopot és megjegyzést ír.
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    const sheet = workbook.getWorksheet("Letöltések");
    assert.ok(sheet);
    sheet.getRow(1).getCell(15).value = "Megjegyzés";
    sheet.getRow(2).getCell(15).value = "Ügyféllel egyeztetve";
    await workbook.xlsx.writeFile(path);

    await upsertLogRows(path, [record(), record({ eid: "C3" })]);
    const after = await readSheet(path);
    assert.equal(after.rowCount, 3);
    assert.match(cellText(after.getRow(2).getCell(13).value), /^Elküldve/);
    assert.equal(cellText(after.getRow(2).getCell(15).value), "Ügyféllel egyeztetve");
    assert.equal(cellText(after.getRow(3).getCell(11).value), "C3");
  });

  it("nyitott (Excelben zárolt) fájlba nem ír", async () => {
    const dir = tempDir("naplo");
    const path = join(dir, "letoltesek.xlsx");
    writeFileSync(join(dir, "~$letoltesek.xlsx"), "");
    await assert.rejects(upsertLogRows(path, [record()]), LogLockedError);
  });

  it("deadlineExpired: true rekord piros kitöltés", async () => {
    const path = join(tempDir("naplo"), "letoltesek.xlsx");
    await upsertLogRows(path, [record({ deadlineExpired: true })]);
    const sheet = await readSheet(path);
    const row = sheet.getRow(2);
    const cell = row.getCell(1);

    assert.deepEqual(cell.fill, {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFDE2E1" }
    });
  });

  it("deadlineExpired nélküli (régi) rekord nem piros", async () => {
    const path = join(tempDir("naplo"), "letoltesek.xlsx");
    await upsertLogRows(path, [record()]);
    const cell = (await readSheet(path)).getRow(2).getCell(1);
    assert.notEqual(cell.fill?.type === "pattern" ? cell.fill.pattern : "none", "solid");
  });
});
