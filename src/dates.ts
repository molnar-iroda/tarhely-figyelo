// Naptári számítások `YYYY-MM-DD` alakú dátumokon, a magyar munkaszüneti
// napokkal. A napokban megadott hatósági határidőnél a közlés napja nem számít
// bele, és ha az utolsó nap munkaszüneti nap, a határidő a következő munkanapon
// jár le — ezt a `nextWorkday` és az `addWorkdays` kezeli.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(iso: string): Date {
  const match = ISO_DATE.exec(iso);
  if (!match) {
    throw new Error(`Érvénytelen dátum: ${iso}`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  return fromUtc(toUtc(value)) === value;
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

export function addYears(iso: string, years: number): string {
  const date = toUtc(iso);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return fromUtc(date);
}

/** Húsvétvasárnap (Gergely-naptár, anonim algoritmus). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Az Mt. 102. § (1) szerinti munkaszüneti napok az adott évben. A vasárnapra
 * eső ünnepek (húsvét- és pünkösdvasárnap) hétvégeként úgyis kiesnek.
 */
export function hungarianHolidays(year: number): string[] {
  const easter = easterSunday(year);
  const fixed = ["01-01", "03-15", "05-01", "08-20", "10-23", "11-01", "12-25", "12-26"];
  return [
    ...fixed.map((monthDay) => `${year}-${monthDay}`),
    addDays(easter, -2), // nagypéntek
    addDays(easter, 1), // húsvéthétfő
    addDays(easter, 50) // pünkösdhétfő
  ].sort();
}

export function isWeekend(iso: string): boolean {
  const weekday = toUtc(iso).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function isWorkday(
  iso: string,
  extraHolidays: readonly string[] = [],
  extraWorkdays: readonly string[] = []
): boolean {
  // extraHolidays: mindig szünnap
  if (extraHolidays.includes(iso)) {
    return false;
  }
  const weekday = toUtc(iso).getUTCDay();
  // szombat/vasárnap: csak akkor munkanap, ha extraWorkdays-ben van
  if (weekday === 0 || weekday === 6) {
    return extraWorkdays.includes(iso);
  }
  // hétköznap: szünnap, ha törvényi ünnep, egyébként munkanap
  const year = Number(iso.slice(0, 4));
  return !hungarianHolidays(year).includes(iso);
}

/** A nap maga, ha munkanap; különben a következő munkanap. */
export function nextWorkday(
  iso: string,
  extraHolidays: readonly string[] = [],
  extraWorkdays: readonly string[] = []
): string {
  let day = iso;
  while (!isWorkday(day, extraHolidays, extraWorkdays)) {
    day = addDays(day, 1);
  }
  return day;
}

/** `days` munkanappal a kezdőnap után (a kezdőnap nem számít bele). */
export function addWorkdays(
  iso: string,
  days: number,
  extraHolidays: readonly string[] = [],
  extraWorkdays: readonly string[] = []
): string {
  let day = iso;
  let left = days;
  while (left > 0) {
    day = addDays(day, 1);
    if (isWorkday(day, extraHolidays, extraWorkdays)) {
      left -= 1;
    }
  }
  return day;
}
