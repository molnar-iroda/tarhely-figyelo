// A céglista (melyik céget ki könyveli) betöltése és a levelek céghez rendelése.
//
// A céglista egy Excel-fájl; az oszlopokat a fejléc szövege alapján ismerjük
// fel, így a sorrendjük és a pontos feliratuk szabadon választható.

import ExcelJS from "exceljs";

export interface Company {
  readonly name: string;
  readonly taxNumber: string;
  /** Az adószám első 8 jegye; ezzel azonosítjuk a céget. */
  readonly torzsszam: string | null;
  readonly accountant: string;
  readonly emails: readonly string[];
  /** A sor száma az Excelben, hibaüzenetekhez. */
  readonly row: number;
}

export interface CompanyList {
  readonly companies: readonly Company[];
  readonly warnings: readonly string[];
}

type Field = "name" | "taxNumber" | "accountant" | "emails";

const EMAIL = /^[^@\s;,]+@[^@\s;,]+\.[^@\s;,]+$/;
const TORZSSZAM = /(?<!\d)(\d{8})(?:-\d-\d{2})?(?!\d)/g;

const LEGAL_FORMS: readonly (readonly [string, string])[] = [
  ["korlatolt felelossegu tarsasag", "kft"],
  ["zartkoruen mukodo reszvenytarsasag", "zrt"],
  ["nyilvanosan mukodo reszvenytarsasag", "nyrt"],
  ["reszvenytarsasag", "rt"],
  ["beteti tarsasag", "bt"],
  ["kozkereseti tarsasag", "kkt"],
  ["egyeni vallalkozo", "ev"],
  ["egyeni ceg", "ec"]
];

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeHeader(value: string): string {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Cégnév összehasonlításhoz: ékezet, írásjel és cégforma-változat nélkül. */
export function normalizeName(name: string): string {
  let value = ` ${stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
  for (const [long, short] of LEGAL_FORMS) {
    value = value.replace(` ${long} `, ` ${short} `);
  }
  return value.replace(/\s+/g, " ").trim();
}

export function torzsszamOf(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : null;
}

/** Egy Excel-cella szöveges értéke (képlet, hivatkozás, formázott szöveg is). */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
    if ("result" in value) {
      return cellText(value.result as ExcelJS.CellValue);
    }
    if ("hyperlink" in value && typeof value.hyperlink === "string") {
      return value.hyperlink.replace(/^mailto:/i, "").trim();
    }
    return "";
  }
  return String(value).trim();
}

function fieldOfHeader(header: string): Field | null {
  const key = normalizeHeader(header);
  if (key === "") {
    return null;
  }
  if (key.includes("mail")) {
    return "emails";
  }
  if (key.includes("adoszam") || key.includes("torzsszam")) {
    return "taxNumber";
  }
  if (key.includes("konyvelo") || key.includes("felelos")) {
    return "accountant";
  }
  if (key.includes("ceg") || key.includes("nev") || key.includes("megnevezes")) {
    return "name";
  }
  return null;
}

export function parseEmails(value: string): string[] {
  return value
    .split(/[;,\s]+/)
    .map((item) => item.trim().replace(/^mailto:/i, ""))
    .filter((item) => item !== "");
}

export async function loadCompanyList(path: string): Promise<CompanyList> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(path);
  } catch (error) {
    throw new Error(
      `A céglista nem olvasható (${path}): ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const sheet = workbook.worksheets[0];
  if (sheet === undefined) {
    throw new Error(`A céglistában nincs munkalap: ${path}`);
  }

  // A fejléc az első olyan sor (az első ötből), amelyben a cégnév és az
  // e-mail oszlop is felismerhető.
  let headerRow = 0;
  let columns = new Map<Field, number>();
  for (let rowNumber = 1; rowNumber <= Math.min(5, sheet.rowCount); rowNumber += 1) {
    const found = new Map<Field, number>();
    sheet.getRow(rowNumber).eachCell((cell, column) => {
      const field = fieldOfHeader(cellText(cell.value));
      if (field !== null && !found.has(field)) {
        found.set(field, column);
      }
    });
    if (found.has("name") && found.has("emails")) {
      headerRow = rowNumber;
      columns = found;
      break;
    }
  }
  if (headerRow === 0) {
    throw new Error(
      `A céglistában nem találom a fejlécet (${path}). Kell legalább egy „Cég neve” és egy „Könyvelő e-mail” oszlop.`
    );
  }

  const warnings: string[] = [];
  if (!columns.has("taxNumber")) {
    warnings.push("A céglistában nincs „Adószám” oszlop: a cégeket csak név alapján tudom azonosítani.");
  }
  const read = (row: ExcelJS.Row, field: Field) => {
    const column = columns.get(field);
    return column === undefined ? "" : cellText(row.getCell(column).value);
  };

  const companies: Company[] = [];
  const byTorzsszam = new Map<string, Company>();
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const name = read(row, "name");
    const taxNumber = read(row, "taxNumber");
    const accountant = read(row, "accountant");
    const rawEmails = parseEmails(read(row, "emails"));
    if (name === "" && taxNumber === "" && rawEmails.length === 0) {
      continue;
    }
    if (name === "") {
      warnings.push(`${rowNumber}. sor: hiányzik a cég neve, a sort kihagytam.`);
      continue;
    }
    const emails = rawEmails.filter((email) => EMAIL.test(email));
    for (const bad of rawEmails.filter((email) => !EMAIL.test(email))) {
      warnings.push(`${rowNumber}. sor (${name}): érvénytelen e-mail cím: ${bad}`);
    }
    if (emails.length === 0) {
      warnings.push(
        `${rowNumber}. sor (${name}): nincs érvényes könyvelő e-mail, a levelei az alapértelmezett címre mennek.`
      );
      continue;
    }
    const torzsszam = taxNumber === "" ? null : torzsszamOf(taxNumber);
    if (taxNumber !== "" && torzsszam === null) {
      warnings.push(`${rowNumber}. sor (${name}): az adószám nem értelmezhető: ${taxNumber}`);
    }
    const company: Company = {
      name,
      taxNumber,
      torzsszam,
      accountant: accountant === "" ? (emails[0] ?? "") : accountant,
      emails,
      row: rowNumber
    };
    if (torzsszam !== null) {
      const existing = byTorzsszam.get(torzsszam);
      if (existing !== undefined) {
        warnings.push(
          `${rowNumber}. sor (${name}): a törzsszám (${torzsszam}) már szerepel a ${existing.row}. sorban, ezt a sort kihagytam.`
        );
        continue;
      }
      byTorzsszam.set(torzsszam, company);
    }
    companies.push(company);
  }
  return { companies, warnings };
}

function uniqueMatch(candidates: readonly Company[]): Company | null {
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? (unique[0] ?? null) : null;
}

function containsWords(haystack: string, needle: string): boolean {
  return needle.length >= 4 && ` ${haystack} `.includes(` ${needle} `);
}

/**
 * A postafiók nevéből (pl. „12345678 (Példa Kft)") a céglista megfelelő sora:
 * elsősorban törzsszám, másodsorban cégnév alapján.
 */
export function matchByMailbox(mailboxName: string, companies: readonly Company[]): Company | null {
  for (const match of mailboxName.matchAll(TORZSSZAM)) {
    const company = companies.find((item) => item.torzsszam === match[1]);
    if (company !== undefined) {
      return company;
    }
  }
  const name = normalizeName(mailboxName.replace(TORZSSZAM, " "));
  if (name === "") {
    return null;
  }
  const exact = uniqueMatch(companies.filter((item) => normalizeName(item.name) === name));
  if (exact !== null) {
    return exact;
  }
  return uniqueMatch(
    companies.filter((item) => {
      const companyName = normalizeName(item.name);
      return containsWords(name, companyName) || containsWords(companyName, name);
    })
  );
}

/**
 * A dokumentum szövegéből: ha pontosan egy cég törzsszáma (vagy, ennek
 * hiányában, pontosan egy cég teljes neve) szerepel benne. Többértelmű
 * találatnál inkább nem rendel céghez, mint hogy rossz könyvelőhöz küldje.
 */
export function matchByContent(text: string, companies: readonly Company[]): Company | null {
  const numbers = new Set([...text.matchAll(TORZSSZAM)].map((match) => match[1]));
  const byNumber = companies.filter(
    (item) => item.torzsszam !== null && numbers.has(item.torzsszam)
  );
  if (byNumber.length > 0) {
    return uniqueMatch(byNumber);
  }
  const normalized = normalizeName(text);
  return uniqueMatch(
    companies.filter((item) => {
      const companyName = normalizeName(item.name);
      return companyName.length >= 6 && containsWords(normalized, companyName);
    })
  );
}

/** Kitölthető minta céglista az első beállításhoz. */
export async function writeCompanyTemplate(path: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cégek");
  sheet.columns = [
    { header: "Cég neve", key: "name", width: 36 },
    { header: "Adószám", key: "taxNumber", width: 16 },
    { header: "Könyvelő", key: "accountant", width: 24 },
    { header: "Könyvelő e-mail", key: "email", width: 32 }
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.addRow({
    name: "Példa Kft.",
    taxNumber: "12345678-2-41",
    accountant: "Minta Anna",
    email: "anna@example.com"
  });
  await workbook.xlsx.writeFile(path);
}
