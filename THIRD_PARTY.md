# Harmadik féltől származó komponensek

A Tárhely-figyelő saját kódja MIT-licencű (lásd `LICENSE`). Az alábbi komponenseket használja vagy
szállítja a telepítőkben; mindegyik a saját licence szerint használható és terjeszthető.

## Beemelt forráskód

| Komponens | Licenc | Megjegyzés |
|---|---|---|
| [godavid/tarhely-cli](https://github.com/godavid/tarhely-cli) (Goldmann Dávid) | MIT | a `src/vendor/tarhely-cli` mappában, saját `LICENSE`-szel és `FORRAS.md`-vel (pontos commit, eltérések) |

## Közvetlen függőségek (npm)

| Csomag | Licenc |
|---|---|
| `@napi-rs/canvas` | MIT |
| `@napi-rs/keyring` | MIT |
| `@tesseract.js-data/hun` | MIT (a csomag; a mögötte lévő Tesseract-nyelvi adat Apache-2.0) |
| `exceljs` | MIT |
| `fflate` | MIT |
| `nodemailer` | MIT-0 |
| `playwright` | Apache-2.0 |
| `tesseract.js` | Apache-2.0 |
| `unpdf` | MIT |

Az átmenő (tranzitív) függőségek a `package-lock.json`-ban vannak; ezek nagyrészt MIT, ISC, BSD és
Apache-2.0 licencűek. A teljes lista és a verziók: `npm ls --omit=dev --all`.

## A telepítőkbe csomagolt futtatókörnyezetek

| Komponens | Licenc | Megjegyzés |
|---|---|---|
| [Node.js](https://nodejs.org) 22 | MIT (és a beépített részek licencei) | hordozható, a hivatalos build; a licencszöveg a Node.js saját `LICENSE` fájljában |
| Chromium (Playwright-build) | BSD-3-Clause és a beépített részek licencei | a böngésző saját licencfájljai a `browsers` mappában vannak |
| FFmpeg (a Playwright-build része) | LGPL | csak a Playwright-csomag mellékeli, a program nem használja |
| [Inno Setup](https://jrsoftware.org/isinfo.php) | Inno Setup-licenc | csak a Windows-telepítő összeállításához kell, a futó programban nincs benne |

## Márkajegyek

A Microsoft, Windows, Microsoft 365, Apple, macOS, Google, Gmail, Chromium és egyéb nevek a
tulajdonosaik márkajegyei; csak a kompatibilitás megnevezésére szerepelnek. A program **nem hivatalos**,
semmilyen módon nem áll kapcsolatban a felsorolt cégekkel, a NAV-val vagy a KAÜ/tarhely.gov.hu üzemeltetőivel.
