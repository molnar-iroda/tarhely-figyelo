// Hibaüzenet a felhasználónak. A beemelt tarhely-cli hibáinak tanácsa a
// tarhely-cli saját parancsaira mutat; ezeket a mi parancsainkra fordítjuk.

/** Hol rögzíthetők a belépők: telepített változatban a kezelőfelületen, egyébként a parancssorban. */
export function setupHint(env: NodeJS.ProcessEnv = process.env): string {
  return env.TARHELY_BEALLITASOK !== undefined && env.TARHELY_BEALLITASOK !== ""
    ? "a Tárhely-figyelő Beállítások oldalán"
    : "npm run beallitas";
}

const HINTS: Readonly<Record<number, string>> = {
  2: `Rögzítsd a belépőt: ${setupHint()}`,
  3: `Ellenőrizd a felhasználónevet, a jelszót és a hitelesítő kulcsot (${setupHint()} újra rögzíti); a gép órájának is pontosnak kell lennie.`,
  4: "A tárhely-portál felülete megváltozhatott. Futtasd: npm run futtatas -- --debug --lathato, és nézd meg az adat/debug mappát."
};

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const { code, hint } = error as { code?: unknown; hint?: unknown };
  const advice = (typeof code === "number" ? HINTS[code] : undefined) ?? hint;
  return typeof advice === "string" && advice !== ""
    ? `${error.message} — ${advice}`
    : error.message;
}
