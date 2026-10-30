// Időpontok budapesti helyi időben: a napló és az e-mail ezt mutatja, a gép
// időzónájától függetlenül.

const TIME_ZONE = "Europe/Budapest";

const FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

interface LocalParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function budapestParts(date: Date): LocalParts {
  const parts = Object.fromEntries(
    FORMATTER.formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `2026-10-27 10:15:03` budapesti idő szerint. */
export function formatLocalDateTime(date: Date): string {
  const p = budapestParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** `2026-10-27` budapesti idő szerint. */
export function localDate(date: Date): string {
  const p = budapestParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * Excel-cellába szánt dátum. Az exceljs UTC-ből számolja a cella értékét,
 * ezért a budapesti falióra-időt UTC-ként kódoljuk: így az Excel pontosan azt
 * mutatja, amit egy itteni óra mutatott.
 */
export function excelLocal(date: Date): Date {
  const p = budapestParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

/** `YYYY-MM-DD` vagy `YYYY-MM-DD HH:MM` szöveg Excel-dátumként (falióra-idő). */
export function excelFromLocalText(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const [, y, mo, d, h, mi, s] = match;
  return new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0))
  );
}
