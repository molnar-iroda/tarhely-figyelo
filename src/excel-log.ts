// A letöltött dokumentumok Excel-naplója.
//
// Soronként egy levél, az érkeztetési szám a kulcs: ha egy levél sora már
// megvan (pl. az e-mail elsőre nem ment el, később igen), a sort frissítjük,
// nem duplikáljuk. Az általunk nem ismert, kézzel felvett oszlopokhoz nem
// nyúlunk, így a könyvelők szabadon jegyzetelhetnek a táblában.

import { existsSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import ExcelJS from "exceljs";

import { cellText } from "./companies.ts";
import type { LetterRecord } from "./state.ts";
import { excelFromLocalText, excelLocal, formatLocalDateTime } from "./time.ts";

const SHEET_NAME = "Letöltések";

type Key =
  | "downloadedAt"
  | "accountant"
  | "company"
  | "subject"
  | "deadline"
  | "deadlineNote"
  | "taxNumber"
  | "sender"
  | "type"
  | "receivedAt"
  | "eid"
  | "recipients"
  | "status"
  | "dir";

interface Column {
  readonly key: Key;
  readonly header: string;
  readonly width: number;
  readonly numFmt?: string;
}

export const LOG_COLUMNS: readonly Column[] = [
  { key: "downloadedAt", header: "Letöltés időpontja", width: 20, numFmt: "yyyy-mm-dd hh:mm:ss" },
  { key: "accountant", header: "Felelős", width: 22 },
  { key: "company", header: "Cég neve", width: 32 },
  { key: "subject", header: "Üzenet tárgya", width: 45 },
  { key: "deadline", header: "Határidő", width: 12, numFmt: "yyyy-mm-dd" },
  { key: "deadlineNote", header: "Határidő forrása", width: 50 },
  { key: "taxNumber", header: "Adószám", width: 15 },
  { key: "sender", header: "Feladó", width: 28 },
  { key: "type", header: "Dokumentum típusa", width: 24 },
  { key: "receivedAt", header: "Érkezett", width: 17, numFmt: "yyyy-mm-dd hh:mm" },
  { key: "eid", header: "Érkeztetési szám", width: 28 },
  { key: "recipients", header: "E-mail címzett", width: 30 },
  { key: "status", header: "E-mail állapota", width: 30 },
  { key: "dir", header: "Mappa", width: 40 }
];

const WARNING_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFDE2E1" }
};

export class LogLockedError extends Error {}

/** Az Excel `~$név.xlsx` tulajdonosfájlt tesz a megnyitott munkafüzet mellé. */
export function isOpenInExcel(path: string): boolean {
  return existsSync(join(dirname(path), `~$${basename(path)}`));
}

export function statusText(record: LetterRecord): string {
  switch (record.emailStatus) {
    case "elkuldve":
      return `Elküldve ${record.emailedAt ? formatLocalDateTime(new Date(record.emailedAt)) : ""}`.trim();
    case "proba":
      return "Próba: nem küldve (.eml fájlba írva)";
    case "kihagyva":
      return `Nem küldve: ${record.skipReason ?? "kihagyva"}`;
    case "hiba":
      return `HIBA (${record.emailAttempts}. próbálkozás): ${record.emailError ?? ""}`.trim();
    default:
      return "Függőben";
  }
}

function values(record: LetterRecord): Record<Key, ExcelJS.CellValue> {
  return {
    downloadedAt: excelLocal(new Date(record.downloadedAt)),
    accountant: record.accountant || "— nincs a céglistában —",
    company: record.company || record.mailbox,
    subject: record.subject,
    deadline: record.deadline === null ? "" : excelFromLocalText(record.deadline),
    deadlineNote: record.deadlineNote,
    taxNumber: record.taxNumber,
    sender: record.sender,
    type: record.type,
    receivedAt: excelFromLocalText(record.receivedAt) ?? record.receivedAt,
    eid: record.eid,
    recipients: record.recipients.join("; "),
    status: statusText(record),
    dir: record.dir
  };
}

function prepareSheet(workbook: ExcelJS.Workbook): {
  sheet: ExcelJS.Worksheet;
  columnOf: Map<Key, number>;
} {
  let sheet = workbook.getWorksheet(SHEET_NAME);
  if (sheet === undefined) {
    sheet = workbook.addWorksheet(SHEET_NAME);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }
  const header = sheet.getRow(1);
  const columnOf = new Map<Key, number>();
  header.eachCell((cell, column) => {
    const known = LOG_COLUMNS.find((item) => item.header === cellText(cell.value));
    if (known !== undefined) {
      columnOf.set(known.key, column);
    }
  });
  // A hiányzó oszlopok a meglévők után kerülnek, a kézzel felvettek elé nem.
  let next = header.cellCount + 1;
  for (const column of LOG_COLUMNS) {
    if (columnOf.has(column.key)) {
      continue;
    }
    const cell = header.getCell(next);
    cell.value = column.header;
    sheet.getColumn(next).width = column.width;
    columnOf.set(column.key, next);
    next += 1;
  }
  header.font = { bold: true };
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(header.cellCount, LOG_COLUMNS.length) }
  };
  return { sheet, columnOf };
}

/**
 * A rekordok beírása a naplóba (meglévő sor frissítése vagy új sor). Ha a
 * fájl nyitva van az Excelben, `LogLockedError`-t dob, és nem ír semmit: a
 * rekordok a következő futáskor újra sorra kerülnek.
 */
export async function upsertLogRows(path: string, records: readonly LetterRecord[]): Promise<void> {
  if (records.length === 0) {
    return;
  }
  if (isOpenInExcel(path)) {
    throw new LogLockedError(`A napló nyitva van az Excelben: ${path}`);
  }
  const workbook = new ExcelJS.Workbook();
  if (existsSync(path)) {
    await workbook.xlsx.readFile(path);
  }
  const { sheet, columnOf } = prepareSheet(workbook);
  const eidColumn = columnOf.get("eid") as number;

  const rowOfEid = new Map<string, number>();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const eid = cellText(sheet.getRow(rowNumber).getCell(eidColumn).value);
    if (eid !== "") {
      rowOfEid.set(eid, rowNumber);
    }
  }

  let nextRow = sheet.rowCount + 1;
  for (const record of records) {
    let rowNumber = rowOfEid.get(record.eid);
    if (rowNumber === undefined) {
      rowNumber = nextRow;
      nextRow += 1;
      rowOfEid.set(record.eid, rowNumber);
    }
    const row = sheet.getRow(rowNumber);
    const cells = values(record);
    const warn =
      record.accountant === "" ||
      record.emailStatus === "hiba" ||
      record.emailStatus === "fuggo" ||
      record.deadlineExpired === true;
    for (const column of LOG_COLUMNS) {
      const cell = row.getCell(columnOf.get(column.key) as number);
      cell.value = cells[column.key];
      if (column.numFmt && cells[column.key] instanceof Date) {
        cell.numFmt = column.numFmt;
      }
      cell.fill = warn ? WARNING_FILL : { type: "pattern", pattern: "none" };
    }
    row.commit();
  }

  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp.xlsx`);
  await workbook.xlsx.writeFile(temporary);
  try {
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
      throw new LogLockedError(`A napló nem írható (valószínűleg nyitva van): ${path}`);
    }
    throw error;
  }
}
