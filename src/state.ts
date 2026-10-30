// A feldolgozás állapota levelenként (kinek ment, sikerült-e, bekerült-e a
// naplóba), egy JSON-fájlban. Minden módosítás után azonnal mentjük, átmeneti
// fájlon és átnevezésen át, így egy félbeszakadt futás sem hagy félkész fájlt.

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync
} from "node:fs";
import { dirname } from "node:path";

export type EmailStatus = "fuggo" | "elkuldve" | "hiba" | "kihagyva" | "proba";

export interface LetterRecord {
  readonly eid: string;
  readonly mailbox: string;
  readonly company: string;
  readonly taxNumber: string;
  readonly accountant: string;
  /** Hogyan rendeltük céghez: a postafiók vagy a dokumentum tartalma alapján. */
  readonly matchedBy: "postafiok" | "tartalom" | null;
  readonly recipients: readonly string[];
  readonly subject: string;
  readonly type: string;
  readonly sender: string;
  readonly receivedAt: string;
  /** ISO időbélyeg (UTC), a tárhelyről való letöltés pillanata. */
  readonly downloadedAt: string;
  readonly deadline: string | null;
  readonly deadlineComputed: boolean;
  readonly deadlineNote: string;
  /** Igaz, ha a szövegben lejárt, hivatkozott határidő is van. */
  readonly deadlineExpired?: boolean;
  /** A határidő következő munkanapja, ha a közölt nap munkaszüneti napra esik (régi rekordokban hiányzik). */
  readonly deadlineNextWorkday?: string;
  /** A szöveg OCR-ből származik (a dátumok tévesek lehetnek); régi rekordokban hiányzik. */
  readonly deadlineOcr?: boolean;
  /** A levél mappája az adatmappán belüli tárhely-mappához képest. */
  readonly dir: string;
  /** A csatolandó fájlok a levél mappájához képest. */
  readonly files: readonly string[];
  readonly skipReason: string | null;
  emailStatus: EmailStatus;
  emailError: string | null;
  emailAttempts: number;
  emailedAt: string | null;
  logSynced: boolean;
}

export interface State {
  letters: Record<string, LetterRecord>;
}

export function loadState(path: string): State {
  if (!existsSync(path)) {
    return { letters: {} };
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<State>;
  return { letters: parsed.letters ?? {} };
}

export function writeFileAtomic(path: string, content: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content, { mode: 0o600 });
  renameSync(temporary, path);
}

export function saveState(path: string, state: State): void {
  writeFileAtomic(path, `${JSON.stringify(state, null, 2)}\n`);
}

const STALE_LOCK_MS = 3 * 60 * 60 * 1000;

/**
 * Egyszerre csak egy futás dolgozhat (az ütemező indíthat újat, mielőtt az
 * előző végzett). A 3 óránál régebbi zárat elhagyottnak tekintjük.
 */
export function acquireLock(path: string): () => void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (existsSync(path) && Date.now() - statSync(path).mtimeMs > STALE_LOCK_MS) {
    unlinkSync(path);
  }
  let fd: number;
  try {
    fd = openSync(path, "wx");
  } catch {
    throw new Error(
      `Már fut egy példány (zárfájl: ${path}). Ha biztosan nem fut, töröld a zárfájlt.`
    );
  }
  writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
  closeSync(fd);
  return () => {
    try {
      unlinkSync(path);
    } catch {
      // már nincs meg: nincs mit felszabadítani
    }
  };
}
