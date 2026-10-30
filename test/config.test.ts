import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import { parseConfig } from "../src/config.ts";

const BASE = {
  alapertelmezett_cimzett: "iroda@example.com",
  smtp: { kiszolgalo: "smtp.example.com", felhasznalo: "tarhely@example.com" }
};

describe("beállítások", () => {
  it("BOM-os fájl, relatív útvonalak a beállításfájlhoz képest", () => {
    const raw = `﻿${JSON.stringify({ ...BASE, kezdo_datum: "2026-10-27" })}`;
    const config = parseConfig(raw, join("/srv", "iroda", "beallitasok.json"));
    assert.equal(config.companyListPath, resolve("/srv", "iroda", "ceglista.xlsx"));
    assert.equal(config.dataDir, resolve("/srv", "iroda", "adat"));
    assert.equal(config.startDate, "2026-10-27");
    assert.equal(config.smtp.port, 587);
    assert.equal(config.smtp.secure, false);
    assert.equal(config.smtp.from, "tarhely@example.com");
    assert.deepEqual(config.errorRecipients, ["iroda@example.com"]);
    assert.equal(config.maxAttachmentMb, 20);
    assert.deepEqual(config.extraWorkdays, []);
  });

  it("a minta beállításfájl érvényes", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync(new URL("../beallitasok.minta.json", import.meta.url), "utf8");
    const config = parseConfig(raw, "beallitasok.json");
    assert.equal(config.startDate, null);
    assert.deepEqual(config.skipMailboxes, ["Értesítési tárhely"]);
  });

  it("hiányzó vagy hibás mezők érthető hibával", () => {
    assert.throws(
      () => parseConfig(JSON.stringify({ smtp: BASE.smtp }), "b.json"),
      /alapertelmezett_cimzett/
    );
    assert.throws(
      () => parseConfig(JSON.stringify({ ...BASE, kezdo_datum: "2026.10.27" }), "b.json"),
      /kezdo_datum/
    );
    assert.throws(
      () => parseConfig(JSON.stringify({ ...BASE, titkos_masolat: ["nem-email"] }), "b.json"),
      /érvénytelen e-mail/
    );
    assert.throws(() => parseConfig("{ nem json", "b.json"), /nem érvényes JSON/);
  });

  it("extra_munkanapok: érvényes szombat/vasárnap betöltődik", () => {
    const raw = JSON.stringify({
      ...BASE,
      extra_munkanapok: ["2026-12-12", "2026-12-13"]
    });
    const config = parseConfig(raw, "b.json");
    assert.deepEqual(config.extraWorkdays, ["2026-12-12", "2026-12-13"]);
  });

  it("extra_munkanapok: hétköznapi dátum hibát dob", () => {
    assert.throws(
      () =>
        parseConfig(JSON.stringify({ ...BASE, extra_munkanapok: ["2026-12-11"] }), "b.json"),
      /csak hétvégi nap lehet/
    );
  });

  it("extra_munkanapok: érvénytelen formátum hibát dob", () => {
    assert.throws(
      () =>
        parseConfig(JSON.stringify({ ...BASE, extra_munkanapok: ["2026-12-12-01"] }), "b.json"),
      /extra_munkanapok.*ÉÉÉÉ-HH-NN/
    );
  });

  it("extra_munkanapok: átfedés az extra_munkaszuneti_napok-kal hibát dob", () => {
    assert.throws(
      () =>
        parseConfig(
          JSON.stringify({
            ...BASE,
            extra_munkaszuneti_napok: ["2026-12-12"],
            extra_munkanapok: ["2026-12-12"]
          }),
          "b.json"
        ),
      /nem szerepelhet az „extra_munkaszuneti_napok” között/
    );
  });

  it("extra_munkanapok: hétvégére eső törvényi ünnep nem munkanap", () => {
    // 2027-05-01 szombat és munka ünnepe
    assert.throws(
      () => parseConfig(JSON.stringify({ ...BASE, extra_munkanapok: ["2027-05-01"] }), "b.json"),
      /nem lehet törvényi ünnep/
    );
  });

  it("extra_munkanapok: hiányzó kulcs üres lista", () => {
    const raw = JSON.stringify(BASE);
    const config = parseConfig(raw, "b.json");
    assert.deepEqual(config.extraWorkdays, []);
  });
});
