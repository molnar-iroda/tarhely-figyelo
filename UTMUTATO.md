# Tárhely-figyelő – telepítési és használati útmutató (Windows és Mac)

A Tárhely-figyelő naponta háromszor (munkanapokon) belép a hivatali tárhelyre (tarhely.gov.hu), letölti a
cégeitek Cégkapujába érkezett új leveleket, és mindegyiket e-mailben elküldi
annak a könyvelőnek, aki az adott céget viszi. Közben egy Excel-táblázatba
felírja, mi érkezett, kinek ment, és mi a határidő.

Az első beállítás nagyjából egy óra. Utána a program magától dolgozik.

## Gyorsindítás telepítővel (ajánlott)

1. Töltsd le a legfrissebb `Tarhely-figyelo-Windows.exe` fájlt (**https://github.com/molnar-iroda/tarhely-figyelo/releases**),
   és indítsd el. Rendszergazdai jog nem kell; a telepítő mindent tartalmaz (a Node.js-t és a böngészőt is),
   semmit nem kell külön telepíteni. Ha a Windows „A számítógépét védte a Windows” ablakot mutat, kattints a
   **További információ**, majd a **Futtatás mindenképp** gombra (a telepítő nincs digitálisan aláírva).
   A telepítés közben pipálhatod az **automatikus futás** beállítását is.
2. A telepítés végén nyílik a **Tárhely-figyelő** kezelőfelület (az asztali ikonnal bármikor újra megnyitható).
3. Az **Áttekintés** oldal „Üzembe helyezés” listája végigvezet: Ügyfélkapu+ belépő és a levelező jelszó
   (Beállítások), céglista (Cégek), kezdő dátum, automatikus futás (Ütemezés). Ami hiányzik, mellette
   „Beállítom” gomb van.
4. Először **Próbafutás**, utána **Futtatás most**. Innentől az ütemezett futás magától megy; az eredményt az
   Áttekintés, a Levelek és a Napló oldalon látod.

A beállításaid és a letöltött levelek a `%APPDATA%\Tarhely-figyelo` mappában vannak; frissítéskor vagy
újratelepítéskor megmaradnak. A jelszavak a Windows kulcstartójában vannak, fájlban nem. A lenti, lépésenkénti
leírás a kézi (parancssoros) telepítést mutatja; **a telepítővel nem kell követned** (ugorj a
[Mindennapi használat](#mindennapi-használat) részre).

**Frissítés:** töltsd le az új telepítőt, és futtasd a régi fölé; az adataid megmaradnak.
**Eltávolítás:** Windows-beállítások → Alkalmazások → Tárhely-figyelő. A program rákérdez, hogy az adataidat
is törölje-e, és megszünteti az automatikus futást.

**A kezelőfelület használata:** az asztali ikon a böngészőben nyitja meg (csak erről a gépről érhető el, nem kell
hozzá jelszó). A bal oldali menüben: *Áttekintés* (állapot, teendők, futtatás-gombok), *Levelek*
(határidők, e-mail állapota), *Beállítások* (minden beállítás és a jelszavak), *Cégek*, *Ütemezés*, *Napló*.
Ha 30 percig nem használod, magától leáll; az ikonnal újra megnyitható. Az automatikus futáshoz nem kell
nyitva lennie.

---

## Gyorsindítás Macen

1. Töltsd le a géped típusához való `Tarhely-figyelo-Mac-….dmg` fájlt (**https://github.com/molnar-iroda/tarhely-figyelo/releases**).
   Melyik a tied? A bal felső sarokban az  menü → **Erről a Macről**: ha a „Chip” mellett *Apple M…* áll, az
   **AppleSilicon**; ha *Intel* a processzor, az **Intel**.
2. Nyisd meg a letöltött fájlt, és húzd a **Tarhely-figyelo** ikont az **Applications** mappára.
3. Az első megnyitáskor a Mac figyelmeztet („nem ellenőrizhető fejlesztő”), mert a programot nem írta alá az
   Apple. Ez egyszeri: **Rendszerbeállítások → Adatvédelem és biztonság**, lent a **Megnyitás mindenképp** gomb a
   Tarhely-figyelo mellett, majd jelszó vagy ujjlenyomat.
4. A kezelőfelület a böngészőben nyílik meg; innentől ugyanaz, mint Windowson (lásd fent: Áttekintés →
   „Üzembe helyezés” lista). Az ikon a Launchpadről bármikor újra megnyitja.
5. A jelszavakat a Mac **Kulcskarikája** őrzi. Ha az első futáskor megkérdezi, hogy a „node” hozzáférhet-e,
   válaszd: **Mindig engedélyez**.

Mac-specifikus tudnivalók:

- Az automatikus futás hétköznap 8:00, 12:00 és 16:00 (az **Ütemezés** oldalon módosítható). Akkor fut, ha be
  vagy jelentkezve; ha a Mac az időpontban aludt, ébredéskor pótolja, **kikapcsolt gépen nem fut**. Munkaidőben
  ne hagyd elaludni a gépet (Rendszerbeállítások → Akkumulátor / Energia).
- Az adataid: `~/Library/Application Support/Tarhely-figyelo` (Finderben: Ugrás → Ugrás a mappához). A napló:
  a kezelőfelület **Napló** oldala.
- **Frissítés:** töltsd le az új DMG-t, és húzd a régi fölé (Cseréld le). Az adataid megmaradnak; az
  ütemezést az új verzió után az **Ütemezés → Alkalmaz** gombbal erősítsd meg.
- **Eltávolítás:** előbb az **Ütemezés** oldalon *Ütemezés törlése*, aztán húzd az alkalmazást a Kukába.

A lenti kézi telepítés Windowsra szól; Macen a fenti lépések elegendők.

---

## Kézi telepítés (telepítő nélkül, Windows)

A lenti lépések csak akkor kellenek, ha nem a telepítőt használod (Windows).

## Mielőtt elkezded

**Ezekre lesz szükséged:**

- [ ] Egy **Windows 10 vagy 11** számítógép, ami munkaidőben be van kapcsolva.
- [ ] Annak az embernek az **Ügyfélkapu+ felhasználóneve és jelszava**, aki
      tagja a cégek Cégkapujának (tárhely-hozzáféréssel), valamint a
      **telefonja**, amin a hitelesítő alkalmazás van.
- [ ] Egy **e-mail fiók**, amelyről a program a leveleket küldi (például
      `tarhely@example.com`), és annak adatai: a **levelezőszerver neve**, a
      **port**, a **felhasználónév** és a **jelszó**. Ezeket a
      rendszergazdától vagy a levelezés szolgáltatójától kapod meg.
- [ ] A **céglista**: melyik cég (név, adószám) kihez tartozik (könyvelő neve,
      e-mail címe).
- [ ] Belépés a **GitHubra** (github.com), a program letöltéséhez.

**Három dolog, amit fontos tudni:**

1. **A letöltés átvételnek számít.** Amikor a program letölt egy levelet a
   tárhelyről, az jogilag átvettnek minősül, és a határidők elkezdenek futni.
2. **Csak egy gépen fusson.** Ha két gépen is futna, a könyvelők minden
   levelet kétszer kapnának meg.
3. **A határidőt a program a szövegből olvassa ki.** Ez segítség, nem
   garancia: a határidőt mindig ellenőrizni kell magában a dokumentumban.

---

## 1. lépés – A Node.js telepítése

A Tárhely-figyelő a Node.js nevű ingyenes programra épül, ezt kell először
feltenni.

1. Nyisd meg a böngészőben: **https://nodejs.org**
2. Töltsd le az **LTS** jelzésű, Windowsra való telepítőt (`.msi` fájl).
3. Indítsd el a letöltött fájlt, és kattints végig a **Next** gombokon.
   - A licencszerződésnél pipáld be az elfogadást.
   - Ha megjelenik egy „**Automatically install the necessary tools**”
     jelölőnégyzet, azt **ne** pipáld be, mert nincs rá szükség.
4. A végén kattints a **Finish** gombra.

---

## 2. lépés – A program letöltése

1. Lépj be a GitHubra, és nyisd meg: **https://github.com/molnar-iroda/tarhely-figyelo**
2. Kattints a zöld **Code** gombra, majd a **Download ZIP** pontra. A
   letöltött fájl neve `tarhely-figyelo-main.zip`, a **Letöltések** mappába kerül.
3. **Kattints jobb gombbal** a ZIP-fájlra → **Tulajdonságok**. Ha alul látsz
   egy **Feloldás** jelölőnégyzetet, pipáld be, majd **OK**. Így a Windows nem
   fogja gyanúsnak tartani a programot.
4. Kattints újra jobb gombbal a ZIP-fájlra → **Az összes kibontása…** →
   **Kibontás**.
5. A kibontott mappában lesz egy **`tarhely-figyelo-main`** mappa. Nevezd át
   **`mpcorp`**-ra, és helyezd át közvetlenül a **C:** meghajtóra. A végén a
   program helye legyen: **`C:\mpcorp`**
   - Ha a Windows rendszergazdai engedélyt kér, kattints a **Folytatás**
     gombra. Ha nincs ilyen jogod, kérd meg a rendszergazdát.

> A `C:\mpcorp` mappában ilyen fájlokat kell látnod: `README.md`,
> `UTMUTATO.md`, `futtatas.cmd`, `package.json`, valamint `src` és `test`
> mappák.

---

## 3. lépés – A parancsablak megnyitása

A beállítás egy része egy fekete **parancsablakban** történik. Később is
mindig így nyisd meg:

1. Nyisd meg a **Fájlkezelőben** a `C:\mpcorp` mappát.
2. Kattints fent a **címsorba** (ahol a `C:\mpcorp` felirat látszik).
3. Írd be: **`cmd`**, és nyomj **Entert**.

Megnyílik egy fekete ablak, amelynek az utolsó sora így kezdődik:
`C:\mpcorp>`. Ide fogod beírni (vagy bemásolni) a parancsokat. Mindegyik után
**Entert** kell nyomni.

> **Bemásolás a fekete ablakba:** másold ki a parancsot ebből az útmutatóból,
> majd kattints **jobb egérgombbal** a fekete ablakba (vagy nyomd meg a
> **Ctrl+V**-t).
>
> **Fontos:** ezt a módszert használd, ne a „PowerShell” vagy a „Terminál”
> ablakot, mert azokban a parancsok egy része hibaüzenettel leállhat.

**Ellenőrzés:** írd be a következőt:

```
node --version
```

Ha valami ilyesmit kapsz: `v24.11.0` (a szám lehet más is, de `v24` vagy
nagyobb legyen), akkor a Node.js telepítése sikerült. Ha azt írja, hogy
„nem ismerhető fel”, zárd be az ablakot, és nyiss egy újat (lásd fent). Ha így
sem megy, telepítsd újra a Node.js-t.

---

## 4. lépés – A szükséges részek letöltése

A parancsablakba írd be:

```
npm install
```

Ez néhány percig tart. Közben megjelenhetnek **`npm warn`** kezdetű sorok:
ezek **nem hibák**, nyugodtan figyelmen kívül hagyhatók. A végén valami ilyesmi
áll: `added 209 packages`.

---

## 5. lépés – A hitelesítő alkalmazás kulcsának megszerzése

Az Ügyfélkapu+ belépéshez a telefonos hitelesítő alkalmazás 6 jegyű kódja kell.
Hogy a program ezt a kódot maga elő tudja állítani, szüksége van arra a
**titkos kulcsra**, amiből a telefon is számol. Ezt a kulcsot csak a hitelesítő
alkalmazás **beállításakor** lehet megszerezni, ezért a beállítást újra el kell
végezni:

1. Lépj be az **Ügyfélkapu+** fiókba (ugyfelkapu.gov.hu), és keresd meg a
   **hitelesítő alkalmazás** beállításait.
2. Töröld a meglévő hitelesítő alkalmazást, és **regisztráld újra**.
3. Amikor megjelenik a **QR-kód**:
   - **Olvasd be a telefonnal**, ahogy eddig is (pl. Google vagy Microsoft
     Authenticator).
   - Kattints a QR-kód alatti **„Nem tudom beolvasni a kódot”** feliratra.
     Ekkor megjelenik egy hosszú **betű-szám sor**. **Ez a kulcs**: másold ki,
     és tedd el ideiglenesen (pl. egy Jegyzettömb-fájlba, amit később törölsz).
4. Fejezd be a regisztrációt. A végén kapott **törlőkódot** tedd el biztonságos
   helyre.

> A menüpontok pontos neve eltérhet. Ha elakadsz, segít az Ügyfélkapu+ súgója:
> https://kau.gov.hu/dap/sugo/ugyfelkapu-plusz
>
> **A kulcs olyan, mint egy jelszó.** Ne küldd el e-mailben, és a 6. lépés után
> töröld a fájlt, amibe ideiglenesen kimásoltad.

---

## 6. lépés – A jelszavak rögzítése

A parancsablakba írd be:

```
npm run beallitas
```

A program sorban kérdez. Egy kérdésre úgy válaszolsz, hogy beírod a választ,
majd **Entert** nyomsz.

| A program kérdése | Mit írj be |
| --- | --- |
| `Rögzítsem most az Ügyfélkapu+ belépőt? [i/N]` | **i** |
| `Ügyfélkapu felhasználónév:` | az Ügyfélkapu+ felhasználónév |
| `Ügyfélkapu jelszó:` | az Ügyfélkapu+ jelszó |
| `Hitelesítő alkalmazás kulcsa (TOTP-seed):` | az 5. lépésben kimásolt kulcs |
| `Rögzítsem most az SMTP (levelező) jelszót? [i/N]` | **i** |
| `SMTP jelszó:` | a küldő e-mail fiók jelszava |

> **A jelszó és a kulcs gépelésekor semmi nem jelenik meg a képernyőn,
> csillag sem.** Ez szándékos. Gépeld be (vagy illeszd be jobb egérgombbal),
> és nyomj **Entert**.

A jelszavakat a program a Windows saját, védett jelszótárolójába menti (fájlba
nem kerülnek). Ezután egyszer letölt egy beépített böngészőt (kb. 150 MB), ami
néhány percig tarthat.

A végén két új fájl lesz a `C:\mpcorp` mappában: **`beallitasok.json`** és
**`ceglista.xlsx`**. Ezeket töltöd ki a következő két lépésben.

---

## 7. lépés – A beállítások kitöltése

1. A Fájlkezelőben kattints jobb gombbal a **`beallitasok.json`** fájlra →
   **Társítás** (vagy **Megnyitás ezzel**) → **Jegyzettömb**.
2. Írd át a lenti táblázatban felsorolt sorokat, a saját adataitokkal.
3. Mentsd el (**Ctrl+S**), és zárd be a Jegyzettömböt.

> **Nagyon fontos:** csak az **idézőjelek közötti** szöveget írd át. Az
> idézőjeleknek, a vesszőknek és a kapcsos zárójeleknek maradniuk kell. Ha
> valamit véletlenül kitörölsz, a 9. lépésben a program jelezni fogja.

| Sor | Mit írj bele |
| --- | --- |
| `"kezdo_datum": null,` | Írd át erre: `"kezdo_datum": "2026-11-03",`, de a **mai dátummal**. A program csak az ettől a naptól érkezett leveleket tölti le. Figyelj az idézőjelekre! |
| `"alapertelmezett_cimzett": "iroda@example.com",` | Az iroda e-mail címe. Ide mennek azok a levelek, amelyeket a program nem tud egy céghez sem rendelni. |
| `"hiba_ertesites": "iroda@example.com",` | Ide ír a program, ha valami nem sikerül (pl. nem tud belépni). |
| `"kiszolgalo": "smtp.example.com",` | A levelezőszerver neve. |
| `"port": 587,` | Általában 587 marad. (Ez szám, ezért nincs idézőjelben.) |
| `"felhasznalo": "tarhely@example.com",` | A küldő e-mail fiók felhasználóneve (általában maga az e-mail cím). |
| `"felado": "Tárhely-figyelő <tarhely@example.com>"` | A feladó neve és címe, ahogy a könyvelők látni fogják. |

**Így néz ki egy kitöltött fájl** (a te címeid mások lesznek):

```json
{
  "ceglista": "ceglista.xlsx",
  "naplo": "letoltesek.xlsx",
  "adatmappa": "adat",
  "kezdo_datum": "2026-11-03",
  "kihagyott_postafiokok": ["Értesítési tárhely"],
  "kihagyott_tipusok": [],
  "alapertelmezett_cimzett": "iroda@example.com",
  "titkos_masolat": [],
  "hiba_ertesites": "kovacs.eva@example.com",
  "max_csatolmany_mb": 20,
  "max_level_futasonkent": 200,
  "extra_munkaszuneti_napok": [],
  "extra_munkanapok": [],
  "smtp": {
    "kiszolgalo": "smtp.example.com",
    "port": 587,
    "ssl": false,
    "felhasznalo": "tarhely@example.com",
    "felado": "Tárhely-figyelő <tarhely@example.com>"
  }
}
```

> **Gmail-fiók esetén:** a kiszolgáló `smtp.gmail.com`, a port `587`. A
> 6. lépésben megadott jelszó itt nem a szokásos Gmail-jelszó, hanem egy
> **alkalmazásjelszó**, amit a Google-fiók biztonsági beállításainál lehet
> létrehozni (ehhez a kétlépcsős azonosításnak bekapcsolva kell lennie).
>
> **Microsoft 365 (Outlook) esetén:** kérdezd meg a rendszergazdát, mert ott a
> jelszavas küldést külön engedélyezni kell.

> **Munkaszüneti napok és áthelyezett munkanapok:** a minta-beállításban az
> `extra_munkaszuneti_napok` és az `extra_munkanapok` sor üresen szerepel
> (`[]`), és az első üzembe helyezéskor üresen is maradhat. A törvényi ünnepeket
> a program magától tudja. Ha viszont egy rendelet szabadnapot ad vagy
> munkanapot helyez át (például egy szombati ledolgozást), írd be a napot
> `ÉÉÉÉ-HH-NN` alakban, egyenként, idézőjelben, vesszővel elválasztva. Például:
> `"extra_munkaszuneti_napok": ["2026-12-24"]` és
> `"extra_munkanapok": ["2026-12-12"]` (az `extra_munkanapok` csak szombat vagy
> vasárnap lehet). **Fontos:** ha egy ledolgozós szombatot nem veszel fel, a
> program a napokban számolt határidőt a valósnál későbbre teszi, ezért ezt
> minden évben, a rendelet megjelenése után pótold.

---

## 8. lépés – A céglista kitöltése

1. Nyisd meg Excelben a **`ceglista.xlsx`** fájlt.
2. Az első sor a fejléc, azt hagyd meg. A második sorban egy minta cég van
   („Példa Kft.”): **ezt töröld**, vagy írd felül egy valódi céggel.
3. Minden cég kerüljön egy külön sorba:

| Cég neve | Adószám | Könyvelő | Könyvelő e-mail |
| --- | --- | --- | --- |
| Kovács és Társa Kft. | 12345678-2-41 | Szabó Anna | szabo.anna@example.com |
| Fehér Bt. | 87654321-1-13 | Nagy Péter | nagy.peter@example.com |

4. Mentsd el, és zárd be az Excelt.

**Jó tudni:**

- Az **adószám a legfontosabb**: a program elsősorban ebből ismeri fel a
  céget. Elég az első 8 számjegy is, de a teljes adószám is jó.
- Ha egy céghez **két ember** kap levelet, írd be mindkét e-mail címet
  pontosvesszővel elválasztva: `anna@example.com; peter@example.com`
- A listát **bármikor módosíthatod** (új ügyfél, könyvelőváltás). A program
  minden futáskor újraolvassa.

---

## 9. lépés – Ellenőrzés

Nyisd meg a parancsablakot (3. lépés), és írd be:

```
npm run ellenorzes
```

A program kiírja a céglistában szereplő cégeket, és megnézi, megvan-e minden
jelszó. Ha a végén ez áll: **„Minden rendben.”**, mehetsz tovább. Ha nem, a
kiírt üzenet megmondja, mit kell javítani.

Ezután küldj egy **próba e-mailt** a saját címedre (a `sajat@example.com` helyére a
saját címedet írd, a két kötőjel maradjon):

```
npm run teszt-email -- sajat@example.com
```

Nézd meg a postafiókodat, megérkezett-e a „Tárhely-figyelő: teszt e-mail”
tárgyú levél. Ha nem, nézd meg a levélszemét mappát is. Ha ott sincs, a 7.
lépésben valamelyik e-mail-beállítás hibás, vagy a 6. lépésben rossz jelszót
adtál meg (a `npm run beallitas` újra futtatható).

---

## 10. lépés – A postafiókok ellenőrzése (még semmit nem tölt le)

```
npm run postafiokok
```

A program belép a tárhelyre (ez 1–2 percig tarthat), és kiírja az összes
postafiókot. Mindegyik mellett látszik, hány levél vár benne, és **melyik
könyvelőhöz kerülne**. Ilyenkor **semmit nem tölt le**, tehát a levelek nem
minősülnek átvettnek.

Nézd át a listát:

- ha egy cég mellett `NINCS a céglistában` áll, vedd fel a céglistába (8. lépés);
- ha rossz könyvelő szerepel valamelyik cég mellett, javítsd a céglistában.

Ha a belépés nem sikerül, a hibaüzenet megmondja, mi a gond (pl. rossz jelszó).
Ekkor futtasd újra a `npm run beallitas`-t, és add meg újra a belépőt.

> Ha kíváncsi vagy, mit csinál a program, írd be helyette ezt:
> `npm run postafiokok -- --lathato`. Ekkor egy böngészőablakban követheted a
> belépést.

---

## 11. lépés – Próbafutás

```
npm run proba
```

Ez **már valóban letölti** a `kezdo_datum` óta érkezett leveleket (ez
átvételnek számít!), de **e-mailt még nem küld**. A levelek helyett
e-mail-fájlokat készít, hogy előre lásd, mit kapnának a könyvelők:

- **`C:\mpcorp\adat\proba-emailek`**: a megírt levelek. Dupla kattintással
  megnyílnak az Outlookban.
- **`C:\mpcorp\letoltesek-proba.xlsx`**: a próbatáblázat.

Nézz bele néhányba. Ha minden rendben van, jöhet az éles indulás.

---

## 12. lépés – Az első éles futás

```
npm run futtatas
```

Most a program kiküldi a leveleket a könyvelőknek, és elkészíti a valódi
táblázatot (**`C:\mpcorp\letoltesek.xlsx`**). A próbafutásnál letöltött
levelek is ekkor mennek ki.

---

## 13. lépés – Automatikus futtatás beállítása

Hogy a program magától fusson, a Windows Feladatütemezőjére bízzuk. A parancsablakban:

```
npm run utemezes -- alkalmaz
```

Ez **hétköznap naponta háromszor: 8:00-kor, 12:00-kor és 16:00-kor** futtatja a programot. Más időpontok:
`npm run utemezes -- alkalmaz 07:30 13:15`. Ugyanez grafikusan: `npm run felulet`, majd az **Ütemezés** oldal.
Ha korábban kézzel (`schtasks`) vagy óránként állítottad be, a parancs a régi feladatokat lecseréli.

Ellenőrzés: `npm run utemezes -- allapot` (kiírja a feladatokat és a következő futás idejét).

**Mire figyelj:**

- A program **csak akkor fut, ha a gép be van kapcsolva, és be vagy
  jelentkezve** a Windowsba. A zárolt képernyő nem gond, a kijelentkezés és a
  kikapcsolás igen. Ha egy időpontban kikapcsolt volt a gép, bekapcsoláskor pótolja a futást.
- Állítsd be, hogy a gép munkaidőben **ne menjen alvó állapotba**. Ezt a
  **Gépházban**, a **Rendszer** részen belül az energiagazdálkodási (alvó
  állapot) beállításoknál teheted meg: hálózati táplálásnál az alvás legyen
  „**Soha**”.
- Futás közben **nem jelenik meg ablak**. Az eredményt a kezelőfelület Áttekintése és a Napló mutatja.

---

## Mindennapi használat

### Mit kapnak a könyvelők?

Minden új dokumentumról egy e-mailt, csatolva magát a dokumentumot. A levél
tárgya például:

> Tárhely – Kovács és Társa Kft. – Felhívás (határidő: 2026-11-18)

A levélben benne van a feladó, az érkezés ideje, a határidő, és hogy a
program melyik mondatból olvasta ki. A „(számított, ellenőrizendő)” jelzés azt
jelenti, hogy a dokumentumban „15 napon belül” típusú határidő állt, és a
program a letöltés napjától számolta ki a dátumot.

### A táblázat (`letoltesek.xlsx`)

Minden letöltött dokumentum egy sor benne. A legfontosabb oszlopok: **Letöltés
időpontja, Felelős, Cég neve, Üzenet tárgya, Határidő**. Mellettük látszik, honnan
vette a határidőt, ki kapta meg az e-mailt, és sikerült-e a küldés.

- A **piros hátterű sor** teendőt jelez: vagy nincs felelős könyvelő, vagy nem
  ment el az e-mail.
- **Saját oszlopot is felvehetsz** (pl. „Elintézve”, „Megjegyzés”), a program
  ezekhez nem nyúl.
- **Ne hagyd a táblázatot egész nap nyitva.** Amíg nyitva van, a program nem
  tud bele írni. Ilyenkor a levelek ugyanúgy kimennek, a hiányzó sorokat pedig
  a következő futás pótolja, amikor a táblázat már be van zárva.

### Ha „[NINCS FELELŐS]” tárgyú levél érkezik

Ez a levél az alapértelmezett (irodai) címre megy, ha a program nem tudta
eldönteni, melyik céghez tartozik a dokumentum. Teendő:

1. Továbbítsd kézzel a megfelelő könyvelőnek.
2. Vedd fel a céget a céglistába (`ceglista.xlsx`), hogy legközelebb már
   magától menjen.

### Új ügyfél, könyvelőváltás

Csak írd át a `ceglista.xlsx`-et, és mentsd el. Mást nem kell tenni.

### Ha hibaértesítő e-mail érkezik

| Mit ír a levél? | Mit tegyél? |
| --- | --- |
| „nem fogadta el a felhasználónevet vagy a jelszót” | Megváltozott az Ügyfélkapu-jelszó? Futtasd a `npm run beallitas`-t, és add meg újra (az Ügyfélkapura **i**, az SMTP-re **N**). |
| „nem fogadta el a hitelesítő kódot” | Újra lett állítva a hitelesítő alkalmazás? Végezd el újra az 5. és a 6. lépést. Ellenőrizd azt is, hogy jól jár-e a gép órája. |
| „E-mail nem ment el” | Megváltozott a küldő fiók jelszava? Futtasd a `npm run beallitas`-t (az Ügyfélkapura **N**, az SMTP-re **i**). A program a sikertelen leveleket magától újraküldi, legfeljebb ötször. |
| „A portál másképp viselkedik…” | A tárhely weboldala megváltozott. Ezt nem tudod magad megoldani: szólj annak, aki a programot karbantartja. |

Ugyanarról a hibáról a program legfeljebb 12 óránként ír egyszer.

### Új telefon vagy új hitelesítő alkalmazás

Ha a telefonon újra beállítod a hitelesítő alkalmazást, a régi kulcs érvényét
veszti. Végezd el újra az **5. és a 6. lépést**.

### Hol látom, mit csinált a program?

- Legegyszerűbben a kezelőfelületen: az **Áttekintés** az utolsó futás eredményét, a **Levelek** az
  e-mailek állapotát, a **Napló** a részletes naplót mutatja (a megnyitó gombokkal a mappák is elérhetők).
- A letöltött dokumentumok: **`adat\tarhely`** (telepítve: `%APPDATA%\Tarhely-figyelo\adat\tarhely`;
  kézi telepítésnél `C:\mpcorp\adat\tarhely`)
- A program naplója havonta egy fájlban: az `adat\naplo` mappában (például
  `2026-11.log`, Jegyzettömbbel megnyitható)

### Kézi futtatás, szüneteltetés

A kezelőfelületen: **Áttekintés** → *Futtatás most* / *Próbafutás*; **Ütemezés** → *Kikapcsolás* (pl. szabadság
alatt) és *Bekapcsolás*. Parancsablakból:

| Mit szeretnél? | Parancs |
| --- | --- |
| Futtatás azonnal | `npm run futtatas` |
| Szüneteltetés | `npm run utemezes -- ki` |
| Újraindítás szünet után | `npm run utemezes -- be` |
| Az automatikus futás végleges törlése | `npm run utemezes -- torol` |

---

## Gyakori problémák

| Mit látsz? | Megoldás |
| --- | --- |
| `'node' nem ismerhető fel…` vagy `'npm' nem ismerhető fel…` | Zárd be a parancsablakot, és nyiss újat (3. lépés). Ha így sem megy, telepítsd újra a Node.js-t (1. lépés). |
| `…running scripts is disabled on this system…` | PowerShell-ablakban vagy. Nyisd meg inkább a 3. lépésben leírt módon (`cmd`). |
| `Hibás beállítás (beallitasok.json): nem érvényes JSON` | A 7. lépésben kimaradt egy idézőjel vagy vessző. Vesd össze a fájlt a 7. lépésben látható mintával. |
| `Első futás: add meg, mettől…` | Nincs kitöltve a `kezdo_datum` (7. lépés). |
| `Már fut egy példány` | Egy korábbi futás még dolgozik, várj pár percet. Ha biztosan nem fut semmi (pl. a gép újraindult futás közben), az Áttekintés „Zár feloldása” gombjával, vagy az `adat\futas.lock` törlésével oldd fel. |
| A kezelőfelület „Nincs belépve” / „Érvénytelen belépőkulcs” | Zárd be a böngészőfület, és nyisd meg újra az asztali ikonnal (minden indításhoz új kulcs tartozik). |
| A kezelőfelület nem nyílik meg | Az ikon újraindítja; ha a 8765-ös port foglalt, magától a következőt választja. Parancsablakból: `npm run felulet`. |
| `A napló nyitva van az Excelben` | Zárd be a `letoltesek.xlsx`-et. A következő futás pótolja a sorokat. |

---

## A program frissítése

**Telepítővel:** töltsd le az új `Tarhely-figyelo-Windows.exe` fájlt, és futtasd a régi fölé. A beállításaid,
a letöltött leveleid és a jelszavaid megmaradnak; az ütemezést a telepítő bejelölt opciója újra beállítja.

**Kézi telepítésnél:**

1. Szüneteltesd az automatikus futást: `npm run utemezes -- ki`
2. Töltsd le az új ZIP-et (2. lépés 1–4. pont).
3. A kibontott `tarhely-figyelo-main` mappa **tartalmát** másold be a `C:\mpcorp`
   mappába. Ha a Windows megkérdezi, kattints a „**Fájlok cseréje a
   célhelyen**” lehetőségre.
   (A saját fájljaid – `beallitasok.json`, `ceglista.xlsx`, `letoltesek.xlsx`,
   `adat` mappa – nincsenek benne a ZIP-ben, ezért megmaradnak.)
4. A parancsablakban: `npm install`
5. Indítsd újra az automatikus futást: `npm run utemezes -- be`

---

## Költözés másik gépre

1. **A régi gépen** töröld az automatikus futást (kezelőfelület → Ütemezés → *Ütemezés törlése*, vagy
   `npm run utemezes -- torol`).
2. **Az új gépen** telepítsd a programot (telepítővel, vagy kézi telepítésnél az 1–4. lépés).
3. Másold át a régi gép adatmappájából az újba: a `beallitasok.json`,
   a `ceglista.xlsx`, a `letoltesek.xlsx` fájlt és az **`adat` mappát**. (Telepítve ez a
   `%APPDATA%\Tarhely-figyelo`, kézi telepítésnél a `C:\mpcorp`.) Az
   `adat` mappa nélkül a program nem tudná, mit küldött már el, és mindent
   újra kiküldene.
4. Az új gépen add meg újra a jelszavakat (a jelszavak gépenként
   tárolódnak, ezeket nem lehet átmásolni): kezelőfelület → Beállítások → Belépők, vagy
   `npm run beallitas`. Majd ellenőrzés (9. lépés) és az automatikus futás (13. lépés / Ütemezés oldal).
