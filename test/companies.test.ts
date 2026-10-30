import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import ExcelJS from "exceljs";

import {
  loadCompanyList,
  matchByContent,
  matchByMailbox,
  normalizeName,
  writeCompanyTemplate
} from "../src/companies.ts";

// Minden adat kitalált.
async function writeList(path: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Ügyfelek");
  sheet.addRow(["Ügyfélkör 2026"]);
  sheet.addRow(["Könyvelő e-mail címe", "Adószám", "Cég megnevezése", "Felelős könyvelő"]);
  sheet.addRow([
    { text: "anna@example.com", hyperlink: "mailto:anna@example.com" },
    "12345678-2-41",
    "Példa Kft.",
    "Minta Anna"
  ]);
  sheet.addRow(["bela@example.com; iroda@example.com", "87654321-1-13", "Másik Bt.", "Teszt Béla"]);
  sheet.addRow(["cili@example.com", "12345678", "Duplikált Kft.", "Próba Cili"]);
  sheet.addRow(["", "11112222-2-02", "Címtelen Zrt.", "Senki"]);
  sheet.addRow(["nem-email", "33334444-2-03", "Rossz Cím Kft.", "Valaki"]);
  sheet.addRow(["dora@example.com", "", "Adószám Nélküli Szövetkezet", ""]);
  await workbook.xlsx.writeFile(path);
}

describe("céglista", () => {
  it("felismeri a fejlécet, és jelzi a hibás sorokat", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "ceglista-")), "ceglista.xlsx");
    await writeList(path);
    const { companies, warnings } = await loadCompanyList(path);

    assert.deepEqual(
      companies.map((company) => company.name),
      ["Példa Kft.", "Másik Bt.", "Adószám Nélküli Szövetkezet"]
    );
    const pelda = companies[0];
    assert.equal(pelda?.torzsszam, "12345678");
    assert.deepEqual(pelda?.emails, ["anna@example.com"]);
    assert.equal(pelda?.accountant, "Minta Anna");
    assert.deepEqual(companies[1]?.emails, ["bela@example.com", "iroda@example.com"]);
    // könyvelő neve nélkül az e-mail cím a felelős
    assert.equal(companies[2]?.accountant, "dora@example.com");

    assert.equal(warnings.length, 4);
    assert.ok(warnings.some((warning) => warning.includes("törzsszám (12345678) már szerepel")));
    assert.ok(warnings.some((warning) => warning.includes("Címtelen Zrt.")));
    assert.ok(warnings.some((warning) => warning.includes("érvénytelen e-mail cím: nem-email")));
  });

  it("a minta céglista betölthető", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "ceglista-")), "minta.xlsx");
    await writeCompanyTemplate(path);
    const { companies, warnings } = await loadCompanyList(path);
    assert.equal(companies.length, 1);
    assert.deepEqual(warnings, []);
  });

  it("értelmes hibát ad fejléc nélküli listára", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "ceglista-")), "ures.xlsx");
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("x").addRow(["valami", "más"]);
    await workbook.xlsx.writeFile(path);
    await assert.rejects(loadCompanyList(path), /nem találom a fejlécet/);
  });
});

describe("céghez rendelés", () => {
  const companies = [
    {
      name: "Példa Kft.",
      taxNumber: "12345678-2-41",
      torzsszam: "12345678",
      accountant: "Minta Anna",
      emails: ["anna@example.com"],
      row: 2
    },
    {
      name: "Másik Bt.",
      taxNumber: "87654321-1-13",
      torzsszam: "87654321",
      accountant: "Teszt Béla",
      emails: ["bela@example.com"],
      row: 3
    },
    {
      name: "Adószám Nélküli Szövetkezet",
      taxNumber: "",
      torzsszam: null,
      accountant: "Dóra",
      emails: ["dora@example.com"],
      row: 4
    }
  ];

  it("cégformák egységesítése", () => {
    assert.equal(normalizeName("PÉLDA Korlátolt Felelősségű Társaság"), "pelda kft");
    assert.equal(normalizeName("Példa Kft."), "pelda kft");
  });

  it("postafiók neve alapján: törzsszám, majd név", () => {
    assert.equal(matchByMailbox("12345678 (Példa Kft)", companies)?.name, "Példa Kft.");
    assert.equal(matchByMailbox("Másik Bt (87654321)", companies)?.name, "Másik Bt.");
    assert.equal(
      matchByMailbox("Példa Korlátolt Felelősségű Társaság", companies)?.name,
      "Példa Kft."
    );
    assert.equal(
      matchByMailbox("99999999 (Adószám Nélküli Szövetkezet)", companies)?.name,
      "Adószám Nélküli Szövetkezet"
    );
    assert.equal(matchByMailbox("Értesítési tárhely", companies), null);
    assert.equal(matchByMailbox("55555555 (Ismeretlen Zrt.)", companies), null);
  });

  it("dokumentum tartalma alapján csak egyértelmű találatnál", () => {
    assert.equal(
      matchByContent("Címzett: Másik Bt. (adószám: 87654321-1-13)", companies)?.name,
      "Másik Bt."
    );
    assert.equal(matchByContent("12345678-2-41 és 87654321-1-13 együtt", companies), null);
    assert.equal(
      matchByContent("A Adószám Nélküli Szövetkezet kérelme", companies)?.name,
      "Adószám Nélküli Szövetkezet"
    );
    assert.equal(matchByContent("Ügyszám: 1234567890/2026", companies), null);
  });
});
