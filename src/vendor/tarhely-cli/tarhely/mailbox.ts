// Postafiók-váltás a portál felületén. Egy belépő több postafiókot is láthat
// (személyes + képviselt cég); az API-hívások az aktív postafiók `address-id`-jával
// mennek, ezért a váltás után meg kell várni, hogy a lap frissítse.

import type { Locator, Page } from "playwright";

import { portalChangedError } from "../errors.ts";
import type { StepFn } from "../kau/login.ts";
import { apiHeaders, type MailboxRef, type SniffedState } from "./api.ts";

const MODAL_SELECTOR = "modal-container.show, .modal.show, [role=dialog]";

export async function switchMailbox(
  page: Page,
  sniffed: SniffedState,
  mailbox: MailboxRef,
  step: StepFn
): Promise<void> {
  await dismissModals(page);

  // A belépés után a SPA még „Oldal betöltés alatt…" állapotban lehet, amikor
  // idáig érünk: a portál-API már válaszolt, a választó gombja viszont még nincs a
  // DOM-ban. Többfiókos belépőnél ezért korlátos ideig megvárjuk; egyfiókosnál a
  // gomb hiánya a normális állapot, ott csak rövid türelem jár.
  const selector = page.locator("#mailboxSelectorButton");
  const hasSelector = await selector
    .first()
    .waitFor({ state: "attached", timeout: sniffed.mailboxes.length > 1 ? 45_000 : 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!hasSelector) {
    if (sniffed.mailboxes.length !== 1) {
      throw portalChangedError(`hiányzik a postafiók-választó (${mailbox.name})`);
    }
    apiHeaders(sniffed, mailbox);
    step("postafiok", true, `${mailbox.name} (egyetlen postafiók)`);
    return;
  }

  const previousAddressId = sniffed.addressId;
  const option = page.locator(`#selectMailboxButton_${mailbox.index}`);
  await clickOption(page, selector, option, mailbox.name);

  // A váltás után az address-id frissül; amíg nem, a lekérdezés a MÁSIK postafiók
  // iratait adná vissza. Ha nem jön, az apiHeaders kereszt-ellenőrzése állítja
  // meg a futást.
  for (let tick = 0; tick < 20; tick += 1) {
    if (sniffed.addressId !== previousAddressId) {
      break;
    }
    await page.waitForTimeout(500);
  }
  apiHeaders(sniffed, mailbox);
  step("postafiok", true, mailbox.name);
}

const SPINNER_SELECTOR = ".ngx-spinner-overlay, ngx-spinner .overlay, .loading-overlay";
const CLICK_ATTEMPTS = 3;

/** Megvárja, hogy a portál betöltésjelzője eltűnjön (különben az elnyeli a kattintást). */
async function waitForSpinner(page: Page, timeoutMs = 30_000): Promise<void> {
  await page
    .locator(SPINNER_SELECTOR)
    .first()
    .waitFor({ state: "hidden", timeout: timeoutMs })
    .catch(() => {});
}

/**
 * A postafiók kiválasztása a választóban. Hosszú listánál a gomb a lenyíló
 * görgetett részén van, és a betöltésjelző is eltakarhatja: ezért a választót
 * minden kísérletnél kinyitjuk, megvárjuk a betöltésjelzőt, a gombot a látható
 * részbe görgetjük, és többször próbálkozunk. Végső esetben a gombot a lapon
 * belülről „nyomjuk meg”; hogy tényleg a jó postafiókra váltottunk-e, azt a
 * hívó az address-id alapján ellenőrzi.
 */
async function clickOption(
  page: Page,
  selector: Locator,
  option: Locator,
  name: string
): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= CLICK_ATTEMPTS; attempt += 1) {
    await waitForSpinner(page);
    await dismissModals(page, 3_000);
    const expanded = await selector.getAttribute("aria-expanded").catch(() => null);
    if (expanded === "false") {
      await selector.click({ timeout: 15_000 }).catch((error: unknown) => {
        lastError = error;
      });
      await page.waitForTimeout(800);
    }
    if (!(await option.count().then((count) => count > 0))) {
      if (attempt === CLICK_ATTEMPTS) {
        throw portalChangedError(`hiányzik a postafiók opciója a választóban (${name})`);
      }
      continue;
    }
    try {
      await option.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
      await option.click({ timeout: 10_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  try {
    await option.evaluate((element) => (element as HTMLElement).click());
    return;
  } catch {
    throw lastError instanceof Error ? lastError : new Error(`nem sikerült kiválasztani a postafiókot (${name})`);
  }
}

export async function dismissModals(page: Page, timeoutMs = 12_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = page.locator(MODAL_SELECTOR);
    const count = await open.count().catch(() => 0);
    if (count === 0) {
      return true;
    }
    const closed = await page.evaluate((selector) => {
      const modals = Array.from(document.querySelectorAll(selector));
      for (const modal of modals) {
        for (const button of Array.from(modal.querySelectorAll("button"))) {
          const label = `${button.getAttribute("aria-label") ?? ""} ${button.innerText ?? ""}`;
          if (/bezár|mégse|megse|close/i.test(label)) {
            button.click();
            return true;
          }
        }
      }
      return false;
    }, MODAL_SELECTOR);
    if (!closed) {
      await page.keyboard.press("Escape").catch(() => {});
    }
    await page.waitForTimeout(700);
  }
  return false;
}
