// Határidő keresése egy hatósági irat szövegében.
//
// Két fajtát ismer fel:
// - konkrét dátumot határidő-jelzéssel („határidő: 2026. november 20.",
//   „2026.11.20-ig", „legkésőbb 2026. november 20. napjáig");
// - relatív határidőt („15 napon belül", „8 munkanapon belül", „30 napos
//   határidő"), amit a letöltés napjától számol: a letöltés átvételnek
//   minősül, ettől a naptól futnak a napokban megadott határidők.
//
// A felismerés szabályalapú, ezért az eredmény mindig ellenőrizendő; a
// naplóba a talált szövegrészlet is bekerül, hogy egy pillantással
// ellenőrizhető legyen.

import { addDays, addWorkdays, addYears, isWorkday, nextWorkday } from "./dates.ts";

export interface DeadlineHit {
  /** `YYYY-MM-DD` */
  readonly date: string;
  /** Igaz, ha relatív határidőből számoltuk (pl. „15 napon belül"). */
  readonly computed: boolean;
  readonly snippet: string;
  /**
   * Csak a szövegben kimondott dátumnál: ha az munkaszüneti napra esik, a
   * következő munkanap. A `date` ilyenkor is a közölt nap marad (biztonsági
   * irány: inkább egy nappal korábban intézd, mint egy nappal később).
   */
  readonly nextWorkday?: string;
}

export interface DeadlineResult {
  /** A legvalószínűbb határidő, vagy null, ha nincs a szövegben. */
  readonly date: string | null;
  readonly computed: boolean;
  /** Emberi magyarázat a naplóba és az e-mailbe. */
  readonly note: string;
  readonly hits: readonly DeadlineHit[];
  /**
   * A letöltés napja előtti, határidő-jelzéssel megadott dátumok: lejárt
   * (vagy csak hivatkozott, korábbi) határidők. Sosem lesznek a fő határidő,
   * de jelezni kell őket: a lejárt határidő a legsürgősebb eset.
   */
  readonly expired: readonly DeadlineHit[];
  /** A fő határidő következő munkanapja, ha a közölt nap munkaszüneti napra esik. */
  readonly nextWorkday?: string;
}

const MONTHS: Readonly<Record<string, number>> = {
  január: 1,
  jan: 1,
  február: 2,
  febr: 2,
  feb: 2,
  március: 3,
  márc: 3,
  április: 4,
  ápr: 4,
  május: 5,
  máj: 5,
  június: 6,
  jún: 6,
  július: 7,
  júl: 7,
  augusztus: 8,
  aug: 8,
  szeptember: 9,
  szept: 9,
  szep: 9,
  október: 10,
  okt: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12
};

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  egy: 1,
  két: 2,
  kettő: 2,
  három: 3,
  négy: 4,
  öt: 5,
  hat: 6,
  hét: 7,
  nyolc: 8,
  kilenc: 9,
  tíz: 10,
  tizenöt: 15,
  húsz: 20,
  harminc: 30,
  negyvenöt: 45,
  hatvan: 60,
  kilencven: 90
};

const byLengthDesc = (a: string, b: string) => b.length - a.length;
const MONTH_ALT = Object.keys(MONTHS).sort(byLengthDesc).join("|");
const WORD_ALT = Object.keys(NUMBER_WORDS).sort(byLengthDesc).join("|");

// A bal oldali határ kizárja az adószám végét („12342026-1-12" nem dátum).
const NUMERIC_DATE =
  /(?<![\d-])(20\d{2})\s*[.\-/]\s*(0?[1-9]|1[0-2])\s*[.\-/]\s*(0?[1-9]|[12]\d|3[01])(?![\d]|-\d)/gu;
const NAMED_DATE = new RegExp(
  `(?<![\\d-])(20\\d{2})\\s*\\.?\\s*(${MONTH_ALT})\\.?\\s*(0?[1-9]|[12]\\d|3[01])(?!\\d)`,
  "giu"
);
// „15 napon belül", „15 (tizenöt) napon belül", „8 munkanapon belül", „30 napos határidő"
const RELATIVE = new RegExp(
  `(?<![\\p{L}\\d.,])(\\d{1,3}|${WORD_ALT})\\s*(?:\\(\\s*[\\p{L}\\d]+\\s*\\)\\s*)?(munka)?nap(?:on|jon|os|i)?\\s+(?:belül|határid)`,
  "giu"
);

// A dátum UTÁN álló jelzés: „-ig", „-éig", „-jéig", „. napjáig", „napig".
const SUFFIX_CUE = /^\s*\.?\s*(?:-\s*\p{L}{0,3}ig(?!\p{L})|napjáig|napig|ig(?!\p{L}))/iu;
// A dátum ELŐTT álló jelzés, rövid távolságon belül.
const PREFIX_CUE =
  /(határid|legkésőbb|esedékes|befizetend|megfizetend|teljesítend|benyújtand|pótoland)\p{L}*[^.;]{0,40}$/iu;

// Hatályjelölés: a puszta „-ig” utótagú dátum ilyenkor nem határidő („érvényes:
// 2026. január 1-ig”, „2024. december 31-ig hatályos”, „…-ig terjedő időszak”). Szándékosan szűk: a kifejezett határidő-szóval
// jelzett dátumot (PREFIX_CUE) soha nem zárja ki, mert egy elnyelt lejárt
// határidő sokkal rosszabb, mint egy felesleges figyelmeztetés.
const VALIDITY_BEFORE = /(?<!\p{L})(?:érvényes|hatályos)\s*[:\-–]?\s*$/iu;
const VALIDITY_AFTER = /^\s*\.?\s*(?:-\s*\p{L}{0,3}ig|napig)\s+(?:(?:terjedő|hatályos)(?!\p{L})|érvényes(?!\p{L})\s*(?:[.,;)]|$))/iu;

const MAX_DAYS = 365;
/** Ennyi évnél régebbi, jelzéssel megadott dátumot már nem tekintünk lejárt határidőnek. */
const EXPIRED_LOOKBACK_YEARS = 2;

function normalize(text: string): string {
  return text
    .replace(/­/g, "") // feltételes elválasztójel
    .replace(/-\s*\n\s*/g, "-")
    .replace(/\s+/g, " ");
}

function snippetAt(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 50);
  const to = Math.min(text.length, end + 20);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

function toIso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function monthNumber(name: string): number | null {
  return MONTHS[name.toLowerCase()] ?? null;
}

function absoluteHits(
  text: string,
  startDate: string,
  extraHolidays: readonly string[],
  extraWorkdays: readonly string[]
): { upcoming: DeadlineHit[]; expired: DeadlineHit[] } {
  const latest = addYears(startDate, 3);
  // Szökőnapról (02-29) visszalépve a naptári nap nem létezik: február 28-ra igazítjuk.
  const earliest = startDate.endsWith("-02-29")
    ? `${Number(startDate.slice(0, 4)) - EXPIRED_LOOKBACK_YEARS}-02-28`
    : addYears(startDate, -EXPIRED_LOOKBACK_YEARS);
  const upcoming: DeadlineHit[] = [];
  const expired: DeadlineHit[] = [];
  const collect = (regex: RegExp, month: (raw: string) => number | null) => {
    for (const match of text.matchAll(regex)) {
      const [whole, y, m, d] = match;
      const monthValue = month(m ?? "");
      if (monthValue === null) {
        continue;
      }
      const iso = toIso(Number(y), monthValue, Number(d));
      if (iso === null || iso < earliest || iso > latest) {
        continue;
      }
      const start = match.index;
      const end = start + whole.length;
      const after = text.slice(end, end + 50);
      // A korábbi dátumok pontjai ne szakítsák meg a határidő-jelzés keresését.
      const before = text
        .slice(Math.max(0, start - 90), start)
        .replace(NUMERIC_DATE, "§")
        .replace(NAMED_DATE, "§");
      // Közvetlenül „kelte:”/„kiállítva” címke után álló dátum kelt-dátum, nem a korábbi határidő-szóhoz tartozik.
      const cueScope = /(?:kelt|kiállít)\p{L}*[^\p{L}\d§]{0,4}$/iu.test(before) ? "" : before;
      if (!SUFFIX_CUE.test(after) && !PREFIX_CUE.test(cueScope)) {
        continue;
      }
      const snippet = snippetAt(text, start, end);
      const rolled = isWorkday(iso, extraHolidays, extraWorkdays)
        ? undefined
        : nextWorkday(iso, extraHolidays, extraWorkdays);
      // A munkaszüneti napra közölt határidő a következő munkanapon jár le: ha az
      // még nem múlt el, a határidő nem lejárt, hanem jövőbeli.
      const stillOpen = iso >= startDate || (rolled !== undefined && rolled >= startDate);
      if (stillOpen) {
        upcoming.push(
          rolled === undefined
            ? { date: iso, computed: false, snippet }
            : { date: iso, computed: false, snippet, nextWorkday: rolled }
        );
        continue;
      }
      const deadlineWordFollows = /^\s*\.?[^;]{0,40}határid/iu.test(after);
      const isPeriod =
        VALIDITY_BEFORE.test(before) ||
        (VALIDITY_AFTER.test(after) && !deadlineWordFollows);
      if (PREFIX_CUE.test(cueScope) || (SUFFIX_CUE.test(after) && !isPeriod)) {
        expired.push({ date: iso, computed: false, snippet });
      }
    }
  };
  collect(NUMERIC_DATE, (raw) => Number(raw));
  collect(NAMED_DATE, monthNumber);
  return { upcoming, expired };
}

function relativeHits(
  text: string,
  startDate: string,
  extraHolidays: readonly string[],
  extraWorkdays: readonly string[]
): DeadlineHit[] {
  const hits: DeadlineHit[] = [];
  for (const match of text.matchAll(RELATIVE)) {
    const [whole, amount, workday] = match;
    const raw = (amount ?? "").toLowerCase();
    const days = /^\d+$/.test(raw) ? Number(raw) : (NUMBER_WORDS[raw] ?? 0);
    if (days <= 0 || days > MAX_DAYS) {
      continue;
    }
    const date = workday
      ? addWorkdays(startDate, days, extraHolidays, extraWorkdays)
      : nextWorkday(addDays(startDate, days), extraHolidays, extraWorkdays);
    const start = match.index;
    hits.push({ date, computed: true, snippet: snippetAt(text, start, start + whole.length) });
  }
  return hits;
}

function uniqueByDate(hits: readonly DeadlineHit[]): DeadlineHit[] {
  const seen = new Set<string>();
  return [...hits]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((hit) => {
      if (seen.has(hit.date)) {
        return false;
      }
      seen.add(hit.date);
      return true;
    });
}

/**
 * @param startDate a letöltés napja (`YYYY-MM-DD`), ettől számolunk
 * @param extraHolidays a beállításokban megadott további munkaszüneti napok
 * @param extraWorkdays a beállításokban megadott áthelyezett munkanapok (szombat/vasárnap)
 */
export function findDeadline(
  rawText: string,
  startDate: string,
  extraHolidays: readonly string[] = [],
  extraWorkdays: readonly string[] = []
): DeadlineResult {
  const text = normalize(rawText);
  const found = absoluteHits(text, startDate, extraHolidays, extraWorkdays);
  const absolute = uniqueByDate(found.upcoming);
  const expired = uniqueByDate(found.expired);
  const relative = uniqueByDate(relativeHits(text, startDate, extraHolidays, extraWorkdays));

  // A fő határidő a legkorábbi találat, akkor is, ha számított: egy korábbi
  // határidő elmulasztása a nagyobb kockázat, mint egy fölösleges figyelmeztetés.
  // Azonos napnál a konkrét dátum az erősebb jel.
  const hits = [...absolute, ...relative].sort(
    (a, b) => a.date.localeCompare(b.date) || Number(a.computed) - Number(b.computed)
  );
  const main = hits[0] ?? null;

  const describe = (hit: DeadlineHit) =>
    `${hit.date}${hit.computed ? " (számított, a letöltés napjától)" : ""}` +
    `${hit.nextWorkday === undefined ? "" : ` (munkaszüneti napra esik, a következő munkanap: ${hit.nextWorkday})`}` +
    `: „${hit.snippet}”`;
  const describeExpired = (hit: DeadlineHit) =>
    `LEJÁRT hivatkozott határidő ${hit.date}: „${hit.snippet}”`;
  const others = main === null ? [] : hits.filter((hit) => hit !== main).slice(0, 2);
  const note = [
    ...(main === null ? [] : [main, ...others].map(describe)),
    ...expired.slice(-2).map(describeExpired)
  ].join(" | ");
  return {
    date: main?.date ?? null,
    computed: main?.computed ?? false,
    note,
    hits,
    expired,
    ...(main?.nextWorkday === undefined ? {} : { nextWorkday: main.nextWorkday })
  };
}
