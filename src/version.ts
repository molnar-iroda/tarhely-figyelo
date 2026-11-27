// A program verziószáma (a package.json-ből): a kezelőfelület, a napló, a
// kiküldött levelek lábléce és a `--verzio` kapcsoló is ezt mutatja, hogy a
// gépekre telepített példányok verziója mindenhol azonosítható legyen.

import { readFileSync } from "node:fs";

function readVersion(): string {
  try {
    const parsed = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "?";
  } catch {
    return "?";
  }
}

export const VERSION: string = readVersion();

/** „Tárhely-figyelő 0.5.0” */
export const PRODUCT = `Tárhely-figyelő ${VERSION}`;
