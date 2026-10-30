// Titkok (Ügyfélkapu+ belépő, SMTP-jelszó) az operációs rendszer
// kulcstartójában: Windowson a Hitelesítő adatok kezelője, macOS-en a
// Keychain. Fájlba nem kerülnek. Szerveren env-változóval is megadhatók.

import { createRequire } from "node:module";

import type { KeyringAdapter } from "./vendor/tarhely-cli/store/credentials.ts";

const SERVICE = "mpcorp-tarhely";

export const SMTP_PASSWORD_ENV = "SMTP_JELSZO";

interface Entry {
  getPassword(): string | null;
  setPassword(value: string): void;
  deletePassword(): boolean;
}

function openEntry(account: string): Entry {
  let module_: { Entry: new (service: string, account: string) => Entry };
  try {
    // A natív csomag CommonJS; lustán töltjük, hogy csak akkor kelljen, ha tényleg titok kell.
    module_ = createRequire(import.meta.url)("@napi-rs/keyring");
  } catch (error) {
    throw new Error(
      `Nem érhető el a rendszer kulcstartója: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return new module_.Entry(SERVICE, account);
}

/** Egy kulcstartó-bejegyzés az `mpcorp-tarhely` szolgáltatásnév alatt. */
export function keyring(account: string): KeyringAdapter {
  let entry: Entry | null = null;
  const open = () => {
    entry ??= openEntry(account);
    return entry;
  };
  return {
    get() {
      const opened = open();
      try {
        return opened.getPassword();
      } catch {
        return null;
      }
    },
    set(value) {
      open().setPassword(value);
    },
    delete() {
      const opened = open();
      try {
        return opened.deletePassword();
      } catch {
        return false;
      }
    }
  };
}

export function smtpPassword(env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env[SMTP_PASSWORD_ENV];
  if (fromEnv !== undefined && fromEnv !== "") {
    return fromEnv;
  }
  return keyring("smtp").get();
}
