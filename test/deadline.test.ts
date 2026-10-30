import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addWorkdays,
  easterSunday,
  hungarianHolidays,
  isWorkday,
  nextWorkday
} from "../src/dates.ts";
import { findDeadline } from "../src/deadline.ts";

// 2026-10-27 kedd; október 23. péntek ünnep, november 1. vasárnap.
const START = "2026-10-27";

describe("munkaszüneti napok", () => {
  it("húsvét és a mozgó ünnepek", () => {
    assert.equal(easterSunday(2025), "2025-04-20");
    assert.equal(easterSunday(2026), "2026-04-05");
    assert.equal(easterSunday(2027), "2027-03-28");
    const holidays = hungarianHolidays(2026);
    assert.ok(holidays.includes("2026-04-03"), "nagypéntek");
    assert.ok(holidays.includes("2026-04-06"), "húsvéthétfő");
    assert.ok(holidays.includes("2026-05-25"), "pünkösdhétfő");
    assert.ok(holidays.includes("2026-10-23"));
  });

  it("következő munkanap és munkanapok hozzáadása", () => {
    assert.equal(nextWorkday("2026-10-24"), "2026-10-26");
    assert.equal(nextWorkday("2026-10-23"), "2026-10-26");
    assert.equal(nextWorkday("2026-10-27"), "2026-10-27");
    assert.equal(addWorkdays("2026-10-22", 2), "2026-10-27");
    assert.equal(isWorkday("2026-12-24"), true);
    assert.equal(isWorkday("2026-12-24", ["2026-12-24"]), false);
  });

  it("áthelyezett munkanap (szombat/vasárnap ledolgozás)", () => {
    // 2026-12-12 szombat, extraWorkdays nélkül
    assert.equal(isWorkday("2026-12-12"), false);
    // ugyanaz a szombat, extraWorkdays-szel
    assert.equal(isWorkday("2026-12-12", [], ["2026-12-12"]), true);
    // extraHolidays erősebb az extraWorkdays-nél
    assert.equal(isWorkday("2026-12-12", ["2026-12-12"], ["2026-12-12"]), false);

    // szombat, extraWorkdays-szel maga a nap
    assert.equal(nextWorkday("2026-12-12", [], ["2026-12-12"]), "2026-12-12");
    // szombat, extraWorkdays nélkül -> vasárnap is hétvége -> hétfő
    assert.equal(nextWorkday("2026-12-12", [], []), "2026-12-14");

    // 2026-12-09 szerda, 3 munkanap: 12-10 csütörtök, 12-11 péntek, 12-12 szombat (ledolgozás)
    assert.equal(addWorkdays("2026-12-09", 3, [], ["2026-12-12"]), "2026-12-12");
  });
});

describe("határidő-felismerés", () => {
  it("konkrét dátum a „határidő” szó után", () => {
    const result = findDeadline("A pótlék megfizetésének határideje: 2026. november 20.", START);
    assert.equal(result.date, "2026-11-20");
    assert.equal(result.computed, false);
    assert.match(result.note, /határideje: 2026\. november 20/);
  });

  it("„-ig” és „napjáig” utótag", () => {
    assert.equal(findDeadline("Kérjük 2026.11.15-ig nyújtsa be.", START).date, "2026-11-15");
    assert.equal(findDeadline("legkésőbb 2026. december 1. napjáig", START).date, "2026-12-01");
    assert.equal(findDeadline("2026. 11. 30-áig teljesítse", START).date, "2026-11-30");
  });

  it("a kelt dátumot és a múltbeli dátumot nem veszi határidőnek", () => {
    assert.equal(findDeadline("Budapest, 2026. október 21.", START).date, null);
    assert.equal(findDeadline("Kelt: 2026. november 3.", START).date, null);
    assert.equal(findDeadline("A bevallás határideje 2026. október 1. volt.", START).date, null);
  });

  it("az adószám vége nem dátum", () => {
    assert.equal(findDeadline("határidő adószám: 12342026-1-12", START).date, null);
  });

  it("napokban megadott határidő a letöltés napjától", () => {
    const result = findDeadline(
      "a jelen felhívás kézhezvételétől számított 15 (tizenöt) napon belül pótolja",
      START
    );
    assert.equal(result.date, "2026-11-11");
    assert.equal(result.computed, true);
    assert.match(result.note, /számított/);
  });

  it("hétvégére eső határidő a következő munkanapra tolódik", () => {
    // október 31. szombat, november 1. vasárnap és ünnep
    assert.equal(findDeadline("4 napon belül", START).date, "2026-11-02");
  });

  it("munkanapban és betűvel megadott határidő", () => {
    assert.equal(findDeadline("8 munkanapon belül nyilatkozzon", START).date, "2026-11-06");
    assert.equal(findDeadline("nyolc napon belül", START).date, "2026-11-04");
    assert.equal(findDeadline("30 napos határidővel", START).date, "2026-11-26");
    assert.equal(findDeadline("tizenkilenc napon belül", START).date, null);
  });

  it("több határidőből a legkorábbi a fő, a többi a megjegyzésben", () => {
    const result = findDeadline(
      "Befizetési határidő: 2026. december 15. A hiányt 15 napon belül pótolja.",
      START
    );
    assert.equal(result.date, "2026-11-11");
    assert.equal(result.computed, true);
    assert.equal(result.hits.length, 2);
    assert.match(result.note, /^2026-11-11 \(számított.*\| 2026-12-15: „/);
  });

  it("azonos napon a konkrét dátum az erősebb", () => {
    const result = findDeadline("15 napon belül, azaz 2026. november 11-ig", START);
    assert.equal(result.date, "2026-11-11");
    assert.equal(result.computed, false);
  });

  it("a lejárt, jelzéssel megadott határidő nem tűnik el, de nem is fő határidő", () => {
    const result = findDeadline("A bevallás határideje 2026. október 1. volt.", START);
    assert.equal(result.date, null);
    assert.equal(result.expired.length, 1);
    assert.equal(result.expired[0]?.date, "2026-10-01");
    assert.match(result.note, /^LEJÁRT hivatkozott határidő 2026-10-01: „/);
  });

  it("lejárt és jövőbeli határidő együtt: a jövőbeli a fő, a lejárt a megjegyzésben", () => {
    const result = findDeadline(
      "Az eredeti határidő: 2026. október 1. A pótlás határideje: 2026. november 20.",
      START
    );
    assert.equal(result.date, "2026-11-20");
    assert.equal(result.expired.length, 1);
    assert.match(result.note, /^2026-11-20: „.*\| LEJÁRT hivatkozott határidő 2026-10-01: „/);
  });

  it("a mai határidő még nem lejárt; a két évnél régebbi dátum nem számít lejártnak", () => {
    const today = findDeadline("határidő: 2026. október 27.", START);
    assert.equal(today.date, START);
    assert.equal(today.expired.length, 0);
    assert.equal(findDeadline("határidő: 2020. január 5.", START).expired.length, 0);
  });

  it("a 2 éves visszatekintési ablak széle", () => {
    assert.equal(findDeadline("határidő: 2024. október 27.", START).expired.length, 1);
    assert.equal(findDeadline("határidő: 2024. október 26.", START).expired.length, 0);
  });

  it("időszak- és hatályjelölés nem lejárt határidő", () => {
    for (const text of [
      "a 2025. január 1-jétől 2025. december 31-ig terjedő időszakra",
      "érvényes: 2026. január 1-ig",
      "a 2024. december 31-ig hatályos szabályok szerint"
    ]) {
      assert.equal(findDeadline(text, START).expired.length, 0, text);
    }
  });

  it("a korábbi dátum határidő-szava nem vonatkozik a következő dátumra", () => {
    const result = findDeadline("határidő: 2026. november 20., kiállítás dátuma 2026. október 20.", START);
    assert.equal(result.date, "2026-11-20");
    assert.equal(result.expired.length, 0);
  });

  it("jelzett, de ténylegesen lejárt dátum -ig utótaggal is lejárt", () => {
    assert.equal(findDeadline("Kérjük 2026. szeptember 15-ig teljesíteni.", START).expired.length, 1);
  });

  it("munkaszüneti napra közölt, ma még teljesíthető határidő nem lejárt", () => {
    // 2026-10-24 szombat, 25. vasárnap: a határidő hétfőn (10-26) jár le
    const result = findDeadline("Benyújtási határidő: 2026. október 24.", "2026-10-26");
    assert.equal(result.expired.length, 0);
    assert.equal(result.date, "2026-10-24");
    assert.equal(result.hits[0]?.nextWorkday, "2026-10-26");
    // már a következő munkanap is elmúlt: lejárt
    assert.equal(findDeadline("Benyújtási határidő: 2026. október 24.", "2026-10-27").expired.length, 1);
  });

  it("naptári napos határidő a ledolgozós szombatra esik, nem tolódik hétfőre", () => {
    // 2026-12-09 + 3 nap = 12-12 (szombat)
    assert.equal(findDeadline("3 napon belül", "2026-12-09", [], ["2026-12-12"]).date, "2026-12-12");
    assert.equal(findDeadline("3 napon belül", "2026-12-09").date, "2026-12-14");
  });

  it("valódi lejárt határidőt nem nyel el az időszak/iktatószám/korábbi dátum környezet", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["a tárgyidőszaki adót 2026. október 12-ig kellett megfizetni", "2026-10-12"],
      ["Az adóelőleget 2026. október 12-ig, a negyedéves időszak lezárását követően kellett megfizetni", "2026-10-12"],
      ["2026. január 1-jétől 2026. június 30-ig terjedő időszakra vonatkozó adót 2026. július 20-ig kellett volna megfizetni", "2026-07-20"],
      ["Fizetési határidő (2019.05.01-jén kelt határozat): 2026.10.01.", "2026-10-01"],
      ["Fizetési határidő (2025. 05. 01-jén kelt határozat): 2026. október 1.", "2026-10-01"],
      ["Befizetési határidő (iktatószám: 2026/12-3): 2026.10.01.", "2026-10-01"],
      ["A határidő (a 2026. szeptember 1-jei végzés szerint) 2026. október 1. volt.", "2026-10-01"],
      ["2026. október 12-ig terjedő határidőben kellett teljesíteni", "2026-10-12"],
      ["Kérjük, 2026. szeptember 1-től 2026. szeptember 30-ig nyújtsa be.", "2026-09-30"],
      ["Kérjük, nyújtsa be 2026. szeptember 1-jétől 2026. szeptember 30-ig.", "2026-09-30"],
      ["Teljesíthette 2026.09.01-től 2026.09.30-ig.", "2026-09-30"],
      ["A hiánypótlást (2026. szeptember 1-jétől 2026. szeptember 30-ig) nem teljesítette.", "2026-09-30"],
      ["2025. január 1-től 2025. december 31-ig", "2025-12-31"],
      ["A 2025. május 20. napig terjedő határidőn belül nem teljesített.", "2025-05-20"],
      ["A 2025.05.20. napig terjedő határidőn belül nem teljesített.", "2025-05-20"],
      ["2025. május 20. napig hatályos határidő", "2025-05-20"],
      ["Ön 2025. május 20-ig érvényes kérelmet nem nyújtott be.", "2025-05-20"],
      ["A fellebbezést a határozat közlésétől 2026. szeptember 30-ig lehetett előterjeszteni.", "2026-09-30"],
      ["Az értesítés kézhezvételétől 2026. október 15-ig nyilatkozhatott.", "2026-10-15"],
      ["A hiánypótlásra 2026. szeptember 1-jétől 2026. szeptember 15-ig volt lehetőség.", "2026-09-15"],
      ["Észrevételt 2026. szeptember 1-jétől 2026. szeptember 15-ig tehetett.", "2026-09-15"],
      ["2026. szeptember 1-jétől 2026. szeptember 15-ig az elektronikus felületen lehetett rögzíteni.", "2026-09-15"]
    ];
    for (const [text, expected] of cases) {
      assert.ok(findDeadline(text, START).expired.some((hit) => hit.date === expected), text);
    }
  });

  it("szökőnapi letöltésnél is két teljes év a visszatekintés", () => {
    assert.equal(findDeadline("határidő: 2026. február 28.", "2028-02-29").expired.length, 1);
    assert.equal(findDeadline("határidő: 2026. február 27.", "2028-02-29").expired.length, 0);
  });

  it("vesszővel elválasztott kelt-dátum nem lejárt határidő; a mondatvégi pont megszakítja a jelzést", () => {
    assert.equal(findDeadline("Fizetési határidő: 2026.11.20, kelte: 2026.10.20.", START).expired.length, 0);
    assert.equal(findDeadline("Határidő: 2026. november 20, kiállítva 2026. október 20.", START).expired.length, 0);
    // A mondatvégi pont (kelt-sor a határidő után) nem hosszabbítja meg a határidő-jelzést.
    const letter = findDeadline("A megfizetés határideje: 2026. november 20.\nBudapest, 2026. október 21.", START);
    assert.equal(letter.expired.length, 0);
  });

  it("a mondatvégi „érvényes.” után következő határidő-szó miatt lejárt jelzés marad", () => {
    assert.equal(findDeadline("2026. március 31-ig érvényes. A határidő lejárt.", START).expired.length, 1);
    assert.equal(findDeadline("2026. március 31-ig érvényes. A pótlási határidő lejárt.", START).expired.length, 1);
  });

  it("a munkaszüneti napra közölt fő határidő következő munkanapja az eredményben is szerepel", () => {
    assert.equal(findDeadline("határidő: 2026. október 24.", "2026-10-26").nextWorkday, "2026-10-26");
    assert.equal(findDeadline("határidő: 2026. november 20.", START).nextWorkday, undefined);
  });

  it("jelzés nélküli múltbeli dátum (kelt) nem lejárt határidő", () => {
    assert.equal(findDeadline("Budapest, 2026. október 21.", START).expired.length, 0);
  });

  it("munkaszüneti napra eső közölt határidő: a nap marad, a következő munkanap jelölve", () => {
    // 2026. november 21. szombat
    const saturday = findDeadline("Benyújtási határidő: 2026. november 21.", START);
    assert.equal(saturday.date, "2026-11-21");
    assert.equal(saturday.hits[0]?.nextWorkday, "2026-11-23");
    assert.match(saturday.note, /munkaszüneti napra esik, a következő munkanap: 2026-11-23/);
    // 2026. december 25. péntek, ünnep; 26. szombat -> hétfő
    const holiday = findDeadline("határidő: 2026. december 25.", START);
    assert.equal(holiday.date, "2026-12-25");
    assert.equal(holiday.hits[0]?.nextWorkday, "2026-12-28");
  });

  it("hétköznapi közölt határidőnél nincs munkanap-jelzés; a ledolgozós szombat munkanap", () => {
    const weekday = findDeadline("Benyújtási határidő: 2026. november 20.", START);
    assert.equal(weekday.hits[0]?.nextWorkday, undefined);
    assert.doesNotMatch(weekday.note, /munkaszüneti/);
    const worked = findDeadline("Benyújtási határidő: 2026. november 21.", START, [], ["2026-11-21"]);
    assert.equal(worked.hits[0]?.nextWorkday, undefined);
  });

  it("szöveg határidő nélkül", () => {
    const result = findDeadline("Tájékoztatjuk, hogy kérelmét nyilvántartásba vettük.", START);
    assert.equal(result.date, null);
    assert.equal(result.note, "");
  });

  it("áthelyezett munkanap (ledolgozós szombat) a relatív határidőben", () => {
    // 2026-12-09 szerda; 3 munkanap: 12-10 csütörtök, 12-11 péntek, 12-12 szombat (ledolgozás)
    assert.equal(
      findDeadline("3 munkanapon belül", "2026-12-09", [], ["2026-12-12"]).date,
      "2026-12-12"
    );
    // 8 munkanap: 10. 11. 12(szombat ledolgozás). 14(hétfő). 15. 16. 17. 18(péntek)
    assert.equal(
      findDeadline("8 munkanapon belül", "2026-12-09", [], ["2026-12-12"]).date,
      "2026-12-18"
    );
  });
});
