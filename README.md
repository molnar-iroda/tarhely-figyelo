<p align="center">
  <a href="https://github.com/molnar-iroda/tarhely-figyelo/releases/latest/download/Tarhely-figyelo-Windows.exe"><img src="docs/gomb-windows.svg" alt="Letöltés Windowsra" width="380"></a>
  &nbsp;&nbsp;
  <a href="https://github.com/molnar-iroda/tarhely-figyelo/releases/latest/download/Tarhely-figyelo-Mac-AppleSilicon.dmg"><img src="docs/gomb-mac.svg" alt="Letöltés Macre" width="380"></a>
</p>
<p align="center">
  <sub>Mindig a legfrissebb kiadást tölti le. Régebbi Intel-processzoros Mac:
  <a href="https://github.com/molnar-iroda/tarhely-figyelo/releases/latest/download/Tarhely-figyelo-Mac-Intel.dmg">Intel-változat</a>
  · <a href="https://github.com/molnar-iroda/tarhely-figyelo/releases">minden kiadás</a></sub>
</p>

> **Lépésről lépésre, nem technikusoknak:** [UTMUTATO.md](UTMUTATO.md) –
> telepítés Windowsra és Macre, és a mindennapi használat.
>
> Letöltés után indítsd el a programot, és kövesd a kezelőfelület „Üzembe helyezés” listáját.
>
> **Informatikai üzemeltetésnek / rendszergazdának** (Microsoft 365, engedélyezés, hálózat, Entra ID):
> [Rendszergazdáknak](#rendszergazdáknak-futtatás-vállalati-környezetben-microsoft-365--entra-id).

Belép az Ügyfélkapu+ fiókkal a hivatali tárhelyre (tarhely.gov.hu), letölti a
Cégkapu-postafiókok új leveleit, és mindegyiket e-mailben elküldi annak a
könyvelőnek, aki az adott céget viszi. A letöltésekről Excel-táblát vezet:
mikor töltötte le, ki a felelős, melyik cég, mi a tárgy, és mi a határidő, ha
a dokumentumban van.

```
tarhely.gov.hu ──► letöltés ──► melyik cég? ──► kié a cég? ──► e-mail a könyvelőnek
                                (postafiók,     (ceglista.xlsx)      +
                                 adószám)                       sor a letoltesek.xlsx-ben
```

## Mit tud

- **Telepítő Windowsra** (`Tarhely-figyelo-Windows.exe`): rendszergazdai jog nélkül telepíthető,
  tartalmazza a Node.js-t és a böngészőt, asztali ikont és Start menü-parancsikont készít, és
  kérésre beállítja az automatikus futást.
- **Telepítő Macre** (`Tarhely-figyelo-Mac-AppleSilicon.dmg` / `Tarhely-figyelo-Mac-Intel.dmg`): az alkalmazást az Applications
  mappába kell húzni; ugyanazt a kezelőfelületet adja, a jelszavakat a Kulcskarikán tartja, az
  automatikus futást a launchd végzi. (Apple Silicon = M-chip, Intel = régebbi Mac.)
- **Helyi kezelőfelület** (az asztali ikonnal, böngészőben): áttekintés és üzembe helyezési lista,
  futtatás / próbafutás / ellenőrzés gombbal élő kimenettel, levelek és határidők, beállítások,
  belépők (Windows kulcstartó / Mac Kulcskarika), céglista, ütemezés, napló.
- **Automatikus futás** hétköznap, alapból 8:00, 12:00 és 16:00 (a felületen módosítható);
  a kimaradt futást pótolja.
- **Határidő-felismerés**, szkennelt iratokra helyi OCR-rel.

## Mielőtt használod

- **A letöltés átvételnek minősül.** Amint az eszköz letölt egy levelet, az
  jogilag átvettnek számít, és a napokban megadott határidők ettől futnak –
  akkor is, ha az e-mail később elakad. Ezért az első futás előtt meg kell
  adni, mettől érkezett leveleket töltsön le (lásd lent).
- **A belépő a gépen van.** A jelszó és a hitelesítő alkalmazás kulcsa a
  Windows Hitelesítő adatok kezelőjébe kerül (fájlba nem). Aki a gépen a
  felhasználói fiókodhoz hozzáfér, az a teljes Ügyfélkapudhoz is. Ha a gép
  illetéktelen kézbe kerül: az Ügyfélkapu+ beállításainál regisztráld újra a
  hitelesítő alkalmazást, és változtass jelszót.
- **A levelek titkosítatlanul mennek e-mailben.** A céges levelezőrendszert
  használd, és csak a saját könyvelőidnek küldj.
- **Nem hivatalos eszköz.** Nincs hozzá állami API: a tárhely webes felületét
  használja, ezért ha a portál megváltozik, az eszköz leállhat. Ilyenkor
  hibaértesítő e-mailt küld (lásd lent).
- **A határidőt szövegfelismerés találja meg.** Mindig ellenőrizd magában a
  dokumentumban; a tábla mellé írja, melyik mondatból vette.

## Előfeltételek

1. **Windows-gép vagy Mac** (macOS 12 vagy újabb), ami az ütemezett időpontokban be van kapcsolva.
2. *(Csak kézi telepítésnél)* **Node.js 24 LTS** (legalább 22.18): <https://nodejs.org>.
   Ellenőrzés: `node --version`. A telepítő saját Node.js-t hoz magával.
3. **Ügyfélkapu+ hitelesítő alkalmazással.** Ha még e-mailes kóddal lépsz be,
   előbb [állíts át hitelesítő alkalmazásra](https://kau.gov.hu/dap/sugo/ugyfelkapu-plusz).
4. **A hitelesítő alkalmazás kulcsa (TOTP-seed).** Az Ügyfélkapu+ a
   hitelesítő alkalmazás beállításakor QR-kódot mutat; alatta a **„Nem tudom
   beolvasni a kódot”** feliratra kattintva megjelenik szövegesen is (betű-szám
   sor). Olvasd be a QR-kódot a telefonodba is, és másold ki a szöveges kulcsot:
   így a telefon és a gép ugyanazt a kódot állítja elő. Ha már régebb óta
   használsz hitelesítő alkalmazást, és a kulcsot nem mentetted el, a
   beállítást újra el kell végezni (új QR-kód = új kulcs). A végén kapott
   **törlőkódot** tedd el biztos helyre.
5. **Cégkapu-tagság.** Az Ügyfélkapu+ fióknak tagnak kell lennie minden olyan
   cég Cégkapujában, amelynek a tárhelyét figyelni kell, tárhely-hozzáféréssel.
   Belépés után ezek a postafiókok mind látszanak, az eszköz mindegyiket végignézi.
6. **Levelezőfiók** a küldéshez (pl. `tarhely@example.com`), az SMTP-adataival
   (kiszolgáló, port, felhasználó, jelszó). A nagy szolgáltatók korlátozzák a
   sima jelszavas SMTP-küldést: Gmailnél alkalmazásjelszó kell, Microsoft
   365-nél kérdezd meg a rendszergazdát, hogy a fióknál engedélyezett-e az
   SMTP-hitelesítés, vagy van-e belső továbbító (relay). A beállítás után a
   `teszt-email` parancs megmutatja, működik-e.

## Telepítés

### Telepítővel (ajánlott)

1. Töltsd le a legfrissebb `Tarhely-figyelo-Windows.exe` fájlt a
   [Releases](https://github.com/molnar-iroda/tarhely-figyelo/releases) oldalról, és indítsd el. A telepítő nincs
   kódaláírva, ezért a Windows SmartScreen figyelmeztethet: „További információ → Futtatás mindenképp”.
2. A program a felhasználó mappájába települ (`%LOCALAPPDATA%\Programs\Tarhely-figyelo`), a
   beállítások és a letöltött levelek a `%APPDATA%\Tarhely-figyelo` mappába kerülnek. Frissítéskor az
   új telepítőt a régi fölé kell futtatni; az adatok megmaradnak.
3. A végén megnyílik a **kezelőfelület**; az **Áttekintés** „Üzembe helyezés” listája végigvezet a
   hiányzó lépéseken (belépők, céglista, kezdő dátum, ütemezés).
4. Eltávolítás: Windows-beállítások → Alkalmazások. A program rákérdez, hogy az adatokat is törölje-e;
   az ütemezett feladatokat törli. A jelszavak a Windows kulcstartójában maradnak.

A kezelőfelület csak erről a gépről érhető el (`127.0.0.1`); indításonként új belépőkulcsot használ, a
jelszavakat sosem küldi vissza a böngészőnek, és 30 perc tétlenség után magától leáll (az asztali
ikonnal újra megnyitható). Parancssorból: `npm run felulet` (`--port`, `--nincs-bongeszo`).

### Macen

1. Töltsd le a géped típusának megfelelő `Tarhely-figyelo-Mac-….dmg` fájlt a
   [Releases](https://github.com/molnar-iroda/tarhely-figyelo/releases) oldalról (a menüben  → *Erről a Macről*:
   „Chip: Apple M…” = AppleSilicon, „Processzor: Intel” = Intel), nyisd meg, és húzd a **Tarhely-figyelo**
   ikont az **Applications** mappára.
2. Az első megnyitáskor a Mac figyelmeztet, mert a program nincs Apple-aláírással ellátva
   („nem ellenőrizhető fejlesztő”). Rendszerbeállítások → Adatvédelem és biztonság → görgess le →
   **Megnyitás mindenképp** a Tarhely-figyelo mellett; vagy Terminálban:
   `xattr -dr com.apple.quarantine /Applications/Tarhely-figyelo.app`. Ez egyszeri.
3. Az alkalmazás nem tesz ikont a Dockra: a kezelőfelület a böngészőben nyílik meg, az ikonra kattintva
   (Launchpad / Applications) bármikor újra megnyitható. A beállítások és a letöltött levelek:
   `~/Library/Application Support/Tarhely-figyelo`, a naplók: `~/Library/Logs/Tarhely-figyelo`.
4. A jelszavak a Kulcskarikába (bejelentkezési kulcstartó) kerülnek. Az első futáskor a Mac rákérdezhet,
   hogy a Node hozzáférhet-e: *Mindig engedélyez*. A programfrissítés után (új Node-fájl) ez újra
   előfordulhat egyszer.
5. Eltávolítás: előbb a kezelőfelület **Ütemezés** oldalán az „Ütemezés törlése”, aztán az alkalmazás
   a Kukába. Az adatok a fenti mappában maradnak, ha kell, töröld őket is.

Az automatikus futás a launchd-ben él (`~/Library/LaunchAgents/hu.iroda.tarhely-figyelo.plist`):
hétköznap a megadott időpontokban fut, ha be vagy jelentkezve. Ha a Mac az időpontban aludt, ébredéskor
pótolja; kikapcsolt gépen nem fut. Munkaidőben ne hagyd, hogy a Mac elaludjon (Rendszerbeállítások →
Akkumulátor / Energia, vagy `caffeinate`).

### Kézi telepítés (telepítő nélkül)

Parancssorban (PowerShell), a program mappájában (pl. `C:\mpcorp`):

```powershell
npm install
npm run beallitas
```

A `beallitas` létrehozza a `beallitasok.json`-t és a minta `ceglista.xlsx`-et,
bekéri (rejtve) az Ügyfélkapu+ belépőt és az SMTP-jelszót, és telepíti a
böngészőt (Chromium, egyszeri, kb. 150 MB). Bármikor újrafuttatható, pl.
jelszócsere után. Ugyanez grafikusan: `npm run felulet`.

## Beállítások – `beallitasok.json`

| Kulcs | Jelentés |
| --- | --- |
| `ceglista` | A céglista Excel-fájlja (alapból `ceglista.xlsx`). |
| `naplo` | A letöltési napló Excel-fájlja (alapból `letoltesek.xlsx`). Lehet hálózati meghajtón is, hogy a könyvelők is lássák. |
| `adatmappa` | Ide kerülnek a letöltött iratok, az állapot és a futásnapló (alapból `adat`). |
| `kezdo_datum` | Csak az ettől a naptól (`ÉÉÉÉ-HH-NN`) érkezett leveleket tölti le. **Az első futás előtt állítsd be**, pl. a mai napra. |
| `kihagyott_postafiokok` | Ezeket a postafiókokat (névrészlet) nem nézi. Alapból a saját személyes „Értesítési tárhely”. |
| `kihagyott_tipusok` | Az ilyen típusú vagy tárgyú leveleket naplózza, de nem küldi el (pl. `"Feladási igazolás"`). |
| `alapertelmezett_cimzett` | Ide mennek azok a levelek, amelyeket nem tud céghez rendelni. Kötelező. |
| `titkos_masolat` | Minden kiküldött levél titkos másolatot kap ide (pl. archívum). Elhagyható. |
| `hiba_ertesites` | Ide megy a hibaértesítés (alapból az alapértelmezett címzett). |
| `max_csatolmany_mb` | Ennél nagyobb csatolmány helyett a levél a gépen lévő helyét írja meg (alapból 20). |
| `max_level_futasonkent` | Egy futás legfeljebb ennyi levelet tölt le (alapból 200); a többi a következő futásra marad. |
| `extra_munkaszuneti_napok` | A határidő-számításhoz további munkaszüneti napok (`ÉÉÉÉ-HH-NN` lista), pl. ha december 24. vagy egy áthelyezett pihenőnap az. A törvényi ünnepeket magától tudja. |
| `extra_munkanapok` | Az áthelyezett (ledolgozós) munkanapok (`ÉÉÉÉ-HH-NN` lista), amelyek hétvégére esnek (pl. szombati munkanap, ha rendelettel kijelölve). Csak szombat vagy vasárnap lehet, és nem szerepelhet az `extra_munkaszuneti_napok` között. Ezek beleszámítanak a „munkanapon belül” és napokban megadott határidők számításába. |
| `smtp.kiszolgalo`, `smtp.port` | A levelezőszerver és portja (általában `587`). |
| `smtp.ssl` | `true`, ha a szerver a 465-ös porton azonnali SSL-t vár; 587-nél `false`. |
| `smtp.felhasznalo` | A küldő fiók; üresen hagyva hitelesítés nélkül küld (belső továbbító). |
| `smtp.felado` | A feladó, pl. `"Tárhely-figyelő <tarhely@example.com>"`. |

## Céglista – `ceglista.xlsx`

Egy munkalap, fejléccel. Az oszlopok sorrendje és pontos felirata szabad, a
program a fejlécből ismeri fel őket:

| Cég neve | Adószám | Könyvelő | Könyvelő e-mail |
| --- | --- | --- | --- |
| Példa Kft. | 12345678-2-41 | Minta Anna | anna@example.com |
| Másik Bt. | 87654321-1-13 | Teszt Béla | bela@example.com; iroda@example.com |

- A cég azonosítása az **adószám első 8 jegye** (törzsszám) alapján történik,
  ennek hiányában a cégnév alapján (a „Kft.” és a „Korlátolt Felelősségű
  Társaság” ugyanannak számít).
- Egy céghez több e-mail cím is megadható, `;`-vel elválasztva.
- Ha egy levél olyan postafiókba jön, ami nincs a listában (pl. az iroda saját
  Cégkapujába), a program a **dokumentum szövegében** keresi a listában szereplő
  cégek adószámát. Ha pontosan egyet talál, annak a könyvelőjének küldi;
  különben az alapértelmezett címre, „[NINCS FELELŐS]” tárggyal.

## Első futás, lépésről lépésre

```powershell
npm run ellenorzes                       # beállítások, céglista, titkok rendben vannak-e
npm run teszt-email -- sajat@example.com    # megy-e ki levél
npm run postafiokok                      # belép, és kiírja, melyik postafiók kihez kerül
```

A `postafiokok` **semmit nem tölt le**, csak listáz: látod, hány levél vár
postafiókonként, és hogy melyik könyvelőhöz menne. Ha valami nincs
párosítva, javítsd a céglistát.

Ezután állítsd be a `kezdo_datum`-ot (pl. a mai napra), és jöhet egy próba:

```powershell
npm run proba
```

A próba **valóban letölti** a leveleket (ez átvétel!), de e-mail helyett
`.eml` fájlokat ír az `adat\proba-emailek` mappába (Outlookkal megnyithatók),
és külön `letoltesek-proba.xlsx` naplót vezet. Ha minden jó, az éles futás:

```powershell
npm run futtatas
```

Az éles futás a próbánál letöltött leveleket is kiküldi.

## Ütemezés (Windows Feladatütemező, Macen launchd)

Alapból hétköznap 8:00, 12:00 és 16:00-kor fut. Beállítása a kezelőfelület **Ütemezés** oldalán
(időpontok szabadon felvehetők, ki- és bekapcsolható, mutatja a következő futást), vagy parancssorból:

```powershell
npm run utemezes -- allapot                  # mi van beállítva
npm run utemezes -- alkalmaz                 # 8:00, 12:00, 16:00
npm run utemezes -- alkalmaz 07:30 13:15     # saját időpontok
npm run utemezes -- ki                       # szüneteltetés (szabadság)
npm run utemezes -- be                       # újraindítás
npm run utemezes -- torol                    # törlés
```

Macen egyetlen LaunchAgent készül az összes időponttal (a parancsok ugyanazok). Windowson időpontonként
egy `Tarhely-figyelo-ÓÓPP` nevű feladat készül; az `alkalmaz` a korábbi
(`Tarhely-figyelo`, `Tarhely-figyelo-08`…) feladatokat lecseréli. A feladat ablak nélkül fut
(`futtatas-rejtett.vbs`), a kimaradt futást (kikapcsolt gép) bekapcsoláskor pótolja, és csak akkor fut,
ha a felhasználó be van jelentkezve, mert a jelszavak az ő Hitelesítőadat-kezelőjében vannak. Egyszerre
csak egy futás dolgozik; ha az előző még tart, az új azonnal kilép. Az eredmény az Áttekintésen
(`adat\\utolso-futas.json`) és a naplóban látszik.

## A napló – `letoltesek.xlsx`

| Oszlop | Tartalom |
| --- | --- |
| Letöltés időpontja | másodpercre pontosan, magyar idő szerint |
| Felelős | a könyvelő a céglistából |
| Cég neve | a céglistából (ha nincs benne: a postafiók neve) |
| Üzenet tárgya | a tárhelyen látható tárgy |
| Határidő | a legkorábbi talált határidő |
| Határidő forrása | a mondat, amiből vette; számított határidőnél jelölve |
| Adószám, Feladó, Dokumentum típusa, Érkezett, Érkeztetési szám | a tárhely adatai |
| E-mail címzett, E-mail állapota | kinek ment, és sikerült-e |
| Mappa | hol van a letöltött irat az `adat\tarhely` alatt |

A táblába nyugodtan írhatsz saját oszlopokat (pl. „Elintézve”): a program
csak a saját oszlopait frissíti. A piros hátterű sor teendőt jelez: nincs
felelős, vagy az e-mail nem ment el. Ha a tábla épp nyitva van az Excelben,
a program nem írja felül; a sorokat a következő futáskor pótolja.

## Határidő-felismerés

A program a PDF-ek és szöveges fájlok tartalmában keres:

- **konkrét dátumot határidő-jelzéssel** – „határidő: 2026. november 20.”,
  „2026.11.20-ig”, „legkésőbb 2026. november 20. napjáig”;
- **napokban megadott határidőt** – „15 napon belül”, „15 (tizenöt) napon
  belül”, „8 munkanapon belül”, „30 napos határidő”. Ezt a **letöltés
  napjától** számolja (a letöltés az átvétel), és ha hétvégére vagy ünnepre
  esik, a következő munkanapra teszi (a beállításban felvett `extra_munkanapok`
  – ledolgozós szombat – munkanapnak számít).

Ha több határidő van, a legkorábbi kerül a „Határidő” oszlopba, a többi a
forrás-oszlopba. A szkennelt (képként mentett) PDF-oldalakból és
a képfájlokból (png, jpg, bmp) **helyi OCR-rel** (Tesseract, magyar nyelv) olvas
szöveget: a kép nem hagyja el a gépet, és a felismeréshez nem kell internet. Az
ilyen levélnél a „Határidő forrása” a „Szkennelt irat, OCR-rel felismert szöveg –
a dátumok tévesek lehetnek” figyelmeztetéssel kezdődik, a határidőt mindig az
eredeti iraton is ellenőrizd. Egy PDF-ből legfeljebb 8 oldalt olvas OCR-rel, és
egy képre legfeljebb 2 percet szán. Ha az OCR hibázik, vagy a 8 oldalas határ miatt
egy szkennelt oldal kimarad, a megjegyzés „a szöveg hiányos” figyelmeztetéssel kezdődik
(a szöveges oldalak szövege ilyenkor is megmarad).

**Munkaszüneti napra eső dátumok:** ha a közölt határidő (konkrét dátum)
hétvégére vagy ünnepre esik, a program a közölt napot tartja fő határidőnek
(biztonsági irány: inkább egy nappal korábban intézd, mint egy nappal később),
de a megjegyzésben jelzi, hogy melyik a következő munkanap. A napokban számított
határidő viszont az utolsó nap alapján tolódik: ha az utolsó nap szünnap, a
határidő a következő munkanapra esik.

**Lejárt hivatkozott határidők:** ha a dokumentum a letöltés napjánál korábbi
határidő-jelzéssel megadott dátumot említ (legfeljebb 2 évre visszamenőleg), a
program azt „LEJÁRT hivatkozott határidő”-ként a megjegyzésbe írja, a naplósor
piros háttérrel jelenik meg, és az e-mail tárgya „[LEJÁRT HATÁRIDŐ?]” előtagot
kap. Ez nem feltétlenül mulasztás (az irat gyakran régebbi határidőre hivatkozik),
de mindig ellenőrizendő. Munkaszüneti napra közölt fő határidőnél az e-mail tárgya
és szövege a következő munkanapot is megnevezi. Hatályjelölést („érvényes: … -ig”, „… -ig hatályos”, „-ig terjedő időszak”) nem
jelez lejártnak (kifejezett határidő-szó mellett viszont igen); a puszta
„-tól … -ig” tartomány záró dátumát biztonsági okból lejártnak jelzi; a megjegyzésben a két
legkésőbbi lejárt dátum szerepel. Ha a munkaszüneti napra közölt határidő
következő munkanapja még nem múlt el, a határidő nem lejárt.
Az `extra_munkanapok` között törvényi ünnepre eső nap nem szerepelhet (a program
hibát jelez).

## Jogi tudnivalók és felelősség

- **Nem hivatalos program.** Nem áll kapcsolatban a NAV-val, a KAÜ-vel (Ügyfélkapu+), a tarhely.gov.hu
  üzemeltetőivel, a Microsofttal vagy a Google-lel. A szolgáltatások változása a programot megtörheti.
- **Ügyfélkapu+ belépés.** A program a megadott belépővel és a hitelesítő alkalmazás kulcsával automatizáltan
  lép be a hivatali tárhelyre. **Csak a saját, vagy jogszerű megbízásod alapján használt fiókkal** használd. Hogy az
  automatizált belépés a szolgáltatás **aktuális felhasználási feltételei**, a megbízási szerződéseid és a saját
  szervezeted szabályzata szerint megengedett-e, azt **te ellenőrzöd és te felelsz érte**.
- **A TOTP-kulcs a második faktor.** Aki megszerzi, be tud lépni a fiókodba. A program a rendszer kulcstartójában
  tárolja; ne oszd meg, és ne tedd fel sehova (issue, e-mail, képernyőkép).
- **A határidő-felismerés segédeszköz, nem jogi tanács.** Szkennelt (OCR) iratoknál különösen előfordulhat téves
  dátum; a levelet és a határidőt mindig az eredeti irat alapján ellenőrizd.
- **Személyes adatok.** A letöltött levelek személyes adatot és cégiratokat tartalmazhatnak. Az adatkezelés (GDPR),
  a titoktartás, a mentés és a megőrzés a felhasználó felelőssége; a program a fájlokat nem titkosítja és nem törli.
- **Garancia nélkül.** A szoftver MIT-licenc alatt, „ahogy van” érhető el (lásd [LICENSE](LICENSE)); a készítők
  nem vállalnak felelősséget a használatából eredő károkért, elmulasztott határidőkért vagy kimaradt levelekért.
- **Harmadik féltől származó részek:** [THIRD_PARTY.md](THIRD_PARTY.md). A belépést kezelő kód Goldmann Dávid
  [tarhely-cli](https://github.com/godavid/tarhely-cli) projektjéből származik (MIT); köszönet érte.
- **Biztonsági hiba:** lásd [SECURITY.md](SECURITY.md).

## Rendszergazdáknak: futtatás vállalati környezetben (Microsoft 365 / Entra ID)

Ez a rész az informatikai üzemeltetésnek szól: mit csinál a program a gépen és a hálózaton, mit kell
engedélyezni, és mire érdemes figyelni Microsoft 365-ös bérlőben. Minden állítás a forráskódból és a
telepítő-szkriptekből származik; ahol valami nincs kipróbálva, ott külön jelölöm.

### Röviden

| Kérdés | Válasz |
|---|---|
| Kell rendszergazdai jog a telepítéshez? | **Nem.** Felhasználói szintű telepítés (`PrivilegesRequired=lowest`), a `%LOCALAPPDATA%\Programs\Tarhely-figyelo` mappába. |
| Fut-e szolgáltatásként / szerver / driver? | **Nem.** Nincs Windows-szolgáltatás, driver, tűzfalszabály és rendszerszintű (HKLM) bejegyzés. |
| Fogad-e bejövő kapcsolatot? | Csak a helyi kezelőfelület: `127.0.0.1:8765` (foglaltság esetén 8766–8774), a hálózat felől nem érhető el. |
| Kimenő forgalom | HTTPS (443) a hivatali tárhely és az Ügyfélkapu+ belépés felé, és SMTP a megadott levelezőkiszolgáló felé. Más nincs (lásd lent). |
| Mi fut az ütemezésben? | Felhasználói szintű (`LeastPrivilege`), csak bejelentkezett felhasználóként futó Feladatütemező-feladatok. |
| Hová tárolja a jelszavakat? | A felhasználó Windows Hitelesítőadat-kezelőjébe (Macen Kulcskarika), a szolgáltatásnév `mpcorp-tarhely`. Fájlba nem kerül. |
| Küld-e adatot a fejlesztőnek / felhőbe? | **Nem.** Nincs telemetria, nincs frissítés-ellenőrzés, az OCR (szövegfelismerés) a gépen fut, a magyar nyelvi adat a csomagban van. |
| Alá van-e írva? | **Nem** (nincs kódaláíró tanúsítvány): a telepítő SmartScreen-figyelmeztetést ad, az AppLocker/WDAC-szabályt ennek megfelelően kell megírni. |

### Hálózati engedélyezési lista (kimenő)

| Cél | Port | Mire |
|---|---|---|
| `tarhely.gov.hu`, `*.tarhely.gov.hu` | 443 | a hivatali tárhely (levelek listázása, letöltése) |
| `kau.gov.hu`, `*.kau.gov.hu`, `idp.gov.hu` | 443 | Ügyfélkapu+ (KAÜ) belépés |
| a `beallitasok.json` `smtp.kiszolgalo` értéke | 587 (STARTTLS) vagy 465 (SSL) vagy 25 | kimenő e-mail |

A program böngészője a fenti gépneveken kívül **minden más kérést blokkol**, így a belépés közben sem
keres fel külső oldalt, reklám- vagy nyomkövető-szolgáltatást. A telepítés közben nincs letöltés: a Node.js-t, a Chromiumot és a függőségeket a
telepítő már tartalmazza, így a telepítő a hálózat nélkül is települ (311 MB).

> **Proxy:** a böngésző és az SMTP-kapcsolat nem kap külön proxy-beállítást a programtól. Hitelesítést kérő
> (NTLM/Kerberos) vagy PAC-fájlos proxy mögött **nem próbáltam ki**; ilyen hálózaton a tárhelyek és az SMTP
> kiszolgáló számára közvetlen kimenő kapcsolat (kivétellistával) a biztos megoldás.

### Telepítés, szabályzatok

- **Csendes telepítés** (Intune Win32-alkalmazás, SCCM, parancssor):
  `Tarhely-figyelo-Windows.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER /TASKS=asztal,utemezes`
  (a `/TASKS` elhagyható; `utemezes` = a három hétköznapi időpont beállítása a telepítő végén).
  Eltávolítás: `%LOCALAPPDATA%\Programs\Tarhely-figyelo\unins000.exe /VERYSILENT /SUPPRESSMSGBOXES`.
  Intune-ban felhasználói környezetben (*Install behavior: User*) fut, és észlelési szabálynak jó a
  `%LOCALAPPDATA%\Programs\Tarhely-figyelo\tarhely.cmd` fájl megléte.
- **Mit kerül a gépre:** a program (`src\`, `node_modules\`), egy hordozható **Node.js 22** (`node\node.exe`, a
  nodejs.org hivatalos build), a **Playwright-Chromium** (`browsers\`), parancsfájlok (`tarhely.cmd`,
  `futtatas.cmd`, `felulet.vbs`, `futtatas-rejtett.vbs`). A felhasználói adatok: `%APPDATA%\Tarhely-figyelo`.
- **AppLocker / WDAC / Smart App Control:** a futtatható fájlok felhasználói mappából indulnak, és nincsenek
  aláírva, ezért vagy útvonal-szabály kell a `%LOCALAPPDATA%\Programs\Tarhely-figyelo\*` mappára, vagy
  hash-/kiadó-szabály a `node.exe`-re és a Chromiumra. Aláírt csomagot kérő szabályzat a telepítőt is elutasítja.
- **Windows Script Host:** az ikon és az ütemezés **`wscript.exe`**-n keresztül indul (ablak nélküli indítás
  miatt). Ha a WSH szabályzattal tiltott, vagy egy ASR-szabály („Block JavaScript or VBScript from launching
  downloaded executable content”) megfogja, a program nem indul; ilyenkor kivétel kell, vagy az ütemezett
  feladat átírható közvetlenül `tarhely.cmd futtatas`-ra (az ablak ilyenkor villan egyet).
- **Defender SmartScreen:** a telepítő első indításakor „ismeretlen kiadó” figyelmeztetés jön; helyi
  felhasználói kivétel vagy belső terjesztés (Intune) kiküszöböli.

### Ütemezés a Feladatütemezőben

- Időpontonként egy feladat, `Tarhely-figyelo-ÓÓPP` néven (alapból 08:00, 12:00, 16:00, hétfő–péntek), a
  felhasználó mappájában. Beállítás: `LogonType=InteractiveToken`, `RunLevel=LeastPrivilege`.
- **Csak akkor fut, ha a felhasználó be van jelentkezve** (a zárolt képernyő nem akadály; kijelentkezett vagy
  kikapcsolt gépen nem). Szerveres, felhasználó nélküli futáshoz ez a program jelenlegi formájában nem
  alkalmas: ahhoz a belépőadatok (Hitelesítőadat-kezelő) gépi/szolgáltatásfiókhoz kötése kellene.
- `StartWhenAvailable=true` (a kimaradt futás pótlása), `MultipleInstancesPolicy=IgnoreNew`, 3 órás
  időkorlát, akkumulátoron is fut.
- Ellenőrzés: `schtasks /query /fo LIST | findstr Tarhely` vagy a program **Ütemezés** oldala.

### Adatok és védelmük

- **Hol:** `%APPDATA%\Tarhely-figyelo` (`beallitasok.json`, `ceglista.xlsx`, `letoltesek.xlsx`, `adat\` a
  letöltött levelekkel és mellékletekkel, valamint a naplók).
- **Titkosítatlan fájlok:** a letöltött levelek és az Excel-táblák személyes adatot és cégiratokat
  tartalmazhatnak, a program ezeket **nem titkosítja és nem törli**. A védelem a gép feladata: BitLocker,
  NTFS-jogosultság (csak a felhasználó), megőrzési és mentési szabályzat. Az `%APPDATA%` mappa roaming-profilnál
  vagy mappaátirányításnál a hálózatra is kerülhet; ha ez nem kívánatos, a `TARHELY_BEALLITASOK`
  környezeti változóval vagy a `--beallitasok` kapcsolóval helyi útvonalra lehet mutatni.
- **Jelszavak:** Ügyfélkapu+ belépő és SMTP-jelszó a Hitelesítőadat-kezelőben (a felhasználó DPAPI-kulcsával
  védve, más felhasználó nem olvassa). A jelszó nem kerül se a beállításfájlba, se a naplóba. Csendes
  üzembe helyezéshez a `SMTP_JELSZO` környezeti változó is használható, de a Hitelesítőadat-kezelő jobb.
- **Helyi kezelőfelület:** csak `127.0.0.1`-re kötött, indításonként új véletlen tokennel védett kapcsolat;
  idegen `Host`-fejlécű kérést (DNS-rebinding, rosszindulatú weboldal) elutasít. Terminálkiszolgálón más
  felhasználó is látja a nyitott helyi portot, de token nélkül nem fér hozzá (a token a példány
  adatmappájában van, ezért az adatmappának felhasználónként külön, védettnek kell lennie).
- **GDPR / adatkezelés:** a program a levelek tartalmát a gépen dolgozza fel (OCR is helyben), és kizárólag a
  beállított SMTP-kiszolgálón keresztül küldi tovább a könyvelőknek. Adatfeldolgozói kapcsolat új külső
  szolgáltatással nem keletkezik.

### Kimenő e-mail Microsoft 365-ből (Exchange Online)

A program a levelezéshez **SMTP-t** használ (felhasználónév + jelszó, vagy hitelesítés nélkül). **OAuth 2.0 /
modern hitelesítést (Graph API, XOAUTH2) jelenleg nem támogat.** A Microsoft 365-ben ez döntő:

1. **Authenticated client submission (SMTP AUTH):** `smtp.office365.com`, port **587**, STARTTLS
   (`"ssl": false` a beállításban), felhasználó = a feladó postafiók címe. Feltételek:
   - a postafiókon engedélyezett az SMTP AUTH (`Set-CASMailbox -Identity <cím> -SmtpClientAuthenticationDisabled $false`),
     és a bérlő szintjén sincs letiltva (`Get-TransportConfig | fl SmtpClientAuthenticationDisabled`);
   - a fióknak **licencelt postafióknak** kell lennie, amelyre a bejelentkezés engedélyezett (megosztott
     postafiókba nem lehet SMTP AUTH-tal belépni);
   - a fiókra **nem vonatkozhat MFA-t vagy Conditional Access-szabályt kikényszerítő házirend**, ami a
     jelszavas (Basic) hitelesítést blokkolja: a **Security Defaults** és a legtöbb CA-szabály ezt
     megteszi, ilyenkor kivétel kell egy dedikált szolgáltatásfiókra;
   - **a Microsoft a Basic hitelesítést az Exchange Online SMTP AUTH-ban kivezeti.** A pontos ütemezést és a
     bérlőd állapotát a Message Center / a Microsoft hivatalos közleménye mutatja; ha a bérlőben már le van
     kapcsolva, ez az út nem járható.
2. **SMTP-továbbító (relay) összekötővel, hitelesítés nélkül:** a `beallitasok.json`-ban a `felhasznalo`
   üresen hagyva a program hitelesítés nélkül küld. Exchange Online-ban ehhez egy **bejövő összekötő**
   (*Mail flow → Connectors*, „Your organization’s email server” → „Office 365”) kell, amely a **kiküldő
   gép nyilvános (fix) IP-címét** vagy tanúsítványát engedélyezi, és a kiszolgáló a bérlő MX-végpontja
   (`<bérlő>-<tld>.mail.protection.outlook.com`, port 25). A kimenő 25-ös port sok hálózaton tiltott.
   Ez a vállalati környezetben általában a **legtisztább** megoldás, mert nem tárol postafiók-jelszót.
3. **Belső vállalati SMTP-átjáró** (Exchange on-premises, Postfix, hibrid relay): ugyanúgy, hitelesítéssel
   vagy anélkül.

Teendők: a feladó cím (`smtp.felado`) legyen a bérlő elfogadott tartományában (SPF/DKIM/DMARC), és a
kiküldő szolgáltatásfiókra vagy összekötőre legyen küldési korlát. A program a küldést **nem kényszeríti
TLS-re**: a STARTTLS-t akkor használja, ha a kiszolgáló kínálja (az Exchange Online mindig kínálja); belső
relay esetén ezt a kiszolgálón kell kötelezővé tenni. **Éles Microsoft 365-bérlőn ezt a programot nem
próbáltam ki**; a SMTP-beállítások a szabványos SMTP-n alapulnak, és a Beállítások oldal „Teszt e-mail küldése…” gombja
az éles használat előtt megmutatja, hogy a bérlő elfogadja-e.

### Entra ID, Intune, Conditional Access

- A program **nem lép be Entra ID-vel**, és nem hív Microsoft Graph-ot: nincs szükség alkalmazás-
  regisztrációra, admin consentre vagy API-engedélyre. A Microsoft 365-höz csak az SMTP-n át kapcsolódik.
- Az Ügyfélkapu+ belépés **természetes személy** fiókját használja (a KAÜ-s azonosítás nem a bérlőhöz
  kötött). Érdemes eldönteni, kinek a fiókja legyen, és hogy az automatizált belépés belefér-e a szervezet
  belső szabályzatába és a tárhely felhasználási feltételeibe (a program kizárólag olvas és letölt; nem ír
  vissza a tárhelyre).
- Eszközmegfelelőség (compliance) és Conditional Access a gépre vonatkozik, a program ettől független;
  a gépnek viszont be kell tudnia lépni a fenti célokra (hálózati zónák, TLS-ellenőrzés: a hivatali
  tanúsítványláncot a tanúsítvány-ellenőrző proxyk gyakran megtörik, ilyenkor a tárhelyek kivételt kapjanak).

### Naplózás és ellenőrzés a rendszergazda számára

- **Futásnapló:** a program **Napló** oldala és a havi naplófájl (`%APPDATA%\Tarhely-figyelo\adat\naplo\ÉÉÉÉ-HH.log`); a futások
  eredménye (letöltött/elküldött/hibás levelek) a `letoltesek.xlsx`-ben is megvan.
- **Hibaértesítés:** a `hiba_ertesites` címre e-mail megy, ha egy futás elakad.
- **Feladatütemező eseménynapló:** *Microsoft-Windows-TaskScheduler/Operational* (a feladat indulása és
  kimenetele); folyamatlánc: `Feladatütemező → wscript.exe → cmd.exe → node.exe → chrome.exe` (headless).
- **Kipróbálható biztonságosan:** a Főoldal *Próbafutás* gombja (parancssorban `--proba`) nem küld e-mailt, csak `.eml` fájlokat ír a
  gépre, így az engedélyezés előtt a teljes folyamat kipróbálható éles levelezés nélkül.

### Mac (macOS) vállalati megjegyzések

A DMG ad-hoc aláírású, nem Apple-notarizált, így a Gatekeeper rákérdez; MDM-mel (Jamf, Intune for macOS)
belső terjesztéskor a karantén-jelző eltávolítható (`xattr -dr com.apple.quarantine`). Az ütemezés egy
felhasználói LaunchAgent (`~/Library/LaunchAgents/hu.iroda.tarhely-figyelo.plist`), nem rendszerszintű
démon, a jelszavak a felhasználó Kulcskarikájában vannak.

## Hibák

Ha a belépés nem sikerül, a portál megváltozott, vagy egy e-mail nem ment
el, a program e-mailt küld a `hiba_ertesites` címre (ugyanarról a hibáról
legfeljebb 12 óránként egyet). A sikertelen e-mailt minden futás újra
megpróbálja, legfeljebb ötször. Részletek: `adat\naplo\ÉÉÉÉ-HH.log`.

| Hiba | Teendő |
| --- | --- |
| „nem fogadta el a felhasználónevet vagy a jelszót” / „a hitelesítő kódot” | Belépő újra (kezelőfelület → Beállítások, vagy `npm run beallitas`); a gép órája legyen pontos. |
| „A portál másképp viselkedik…” | `npm run futtatas -- --debug --lathato`, és nézd meg az `adat\debug` mappát. |
| „Már fut egy példány” | Ha biztosan nem fut, a kezelőfelület Áttekintésén a „Zár feloldása” gombbal, vagy az `adat\futas.lock` törlésével oldd fel. |

Csak a már letöltött levelek újrafeldolgozása, belépés nélkül:
`npm run futtatas -- --csak-feldolgozas`.

## Fejlesztés

```powershell
npm test            # tesztek (kitalált adatokkal, belépés nélkül)
npm run typecheck   # TypeScript-ellenőrzés
npm run felulet     # a kezelőfelület helyben
```

A belépést és a letöltést a [tarhely-cli](https://github.com/godavid/tarhely-cli)
beemelt kódja végzi (MIT-licenc): `src/vendor/tarhely-cli/`, részletek a
`FORRAS.md`-ben. A saját kód a `src/` többi része:

| Fájl | Feladat |
| --- | --- |
| `companies.ts` | céglista, párosítás |
| `deadline.ts`, `letter-text.ts` | határidő-felismerés, PDF-/OCR-szöveg |
| `process.ts`, `mailer.ts`, `excel-log.ts` | feldolgozás, e-mail, Excel-napló |
| `run.ts`, `run-status.ts` | egy futás és az utolsó futás összefoglalója |
| `schedule.ts`, `schedule-mac.ts`, `schedule-cli.ts` | a Feladatütemező / launchd kezelése (`utemezes` parancs) |
| `ui/` | a kezelőfelület: `server.ts` (HTTP, védelem), `api.ts` (műveletek), `operations.ts` (futtatások), `launch.ts`, `public/` (HTML/JS/CSS, keretrendszer nélkül) |

**A Mac-telepítő** (`telepito/mac/`): `epit.sh [arm64|x64]` összeállítja a `Tarhely-figyelo.app` csomagot
(hordozható Node.js, Chromium, program; ad-hoc aláírva), és DMG-t készít; `proba.sh` valódi Macen
felcsatolja, elindítja a kezelőfelületet az alkalmazás-indítóval, beállítja a launchd-ütemezést, és egy
valódi `launchctl kickstart`-tal futtatja. Egy lépésben: `bash telepito/mac/epit.sh && bash telepito/mac/proba.sh
telepito/kimenet/*.dmg`. A `Tarhely.icns` az `ikon.mjs`-ből készült (lásd a fájl fejlécét).

**A Windows-telepítő** (`telepito/`): `epit.ps1` összeállítja a hordozható Node.js-t, a Chromiumot és a programot,
majd az Inno Setup (`tarhely.iss`) `.exe`-t készít; `proba.ps1` valódi Windowson csendesen telepít,
ellenőrzi az ütemezést és a kezelőfelületet, majd eltávolít. A `.github/workflows/telepito.yml` ezt
futtatja (a Mac-DMG-ket is); `v*` címkére GitHub Release-t is készít a három telepítővel (a verziót a
`package.json` adja).

```powershell
git tag v0.3.0 && git push --tags   # előbb állítsd át a package.json verzióját
```

A letöltött iratok, a beállítások és a táblák nem kerülhetnek a repóba (lásd
`.gitignore`); tesztekben csak kitalált adat szerepelhet.
