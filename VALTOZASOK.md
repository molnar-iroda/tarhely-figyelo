# Változások

## v0.5.0 – 2026-11-27

### Újdonságok

- **Postafiókok lap a kezelőfelületen.** A program beolvassa a tárhelyen elérhető postafiókokat
  (a lap *Postafiókok beolvasása* gombja; ez semmit nem tölt le), és postafiókonként beállítható, mi történjen velük:
  - **Letölt és küld**: letölti az új leveleket, és elküldi a céglista szerinti könyvelőnek, vagy az itt
    megadott címzettnek;
  - **Csak értesítés**: a levelet **nem tölti le és nem nyitja meg** (nincs átvétel), csak egy jelzést küld a
    megadott címzettnek, hogy új üzenet érkezett. Minden levélről egyszer;
  - **Kihagy**: a postafiókot nem nézi.
- **Titkos másolat ki-be kapcsolása** a Beállítások lapon (`titkos_masolat_be`). Kikapcsolva a címek
  megmaradnak, csak nem kapnak másolatot.
- **Letölti, de nem küldi tovább** (`csak_letoltes_tipusok`): az ilyen típusú vagy tárgyú leveleket a program
  letölti, de senkinek nem küldi el (pl. KNYLEK).
- A **kihagyott üzenettípusokat** (`kihagyott_tipusok`) a program már **letöltés előtt** kiszűri, így ezek nem
  minősülnek átvettnek. A típusnév ékezet, szóköz és kis-nagybetű nélkül is egyezik
  („Feladási igazolás” = „FeladasiIgazolas”).
- Egy futás végén az összefoglaló a letöltés nélküli értesítések számát is mutatja.
- **Verziószám mindenhol**, a gépekre telepítés és a frissítés nyomon követéséhez: a telepítőfájlok neve
  (`Tarhely-figyelo-Windows-0.5.0.exe`, `Tarhely-figyelo-Mac-AppleSilicon-0.5.0.dmg`,
  `Tarhely-figyelo-Mac-Intel-0.5.0.dmg`), a Windows *Alkalmazások* listája („Tárhely-figyelő 0.5.0”) és a
  telepítő fájltulajdonságai, a Mac DMG kötetneve, a kezelőfelület (bal felső sarok és az utolsó futás sora),
  a futásnapló, a kiküldött levelek lábléce, valamint a `tarhely.cmd --verzio` parancs. A README
  „Rendszergazdáknak” része leírja, hol olvasható ki (registry is).

### Javítások

- **Üres feladó a kiküldött levelekben.** Ha a beállításokban a feladó csak egy név volt (pl.
  „Tárhely-figyelő”), a levelek feladó nélkül mentek ki. Most ilyenkor a feladó címe az SMTP-felhasználó lesz
  (pl. „Tárhely-figyelő <tarhely@iroda.hu>”). Ha sem a feladóban, sem a felhasználónévben nincs e-mail-cím, a
  program már indításkor szól.
- **Leállt a futás postafiókváltáskor** („element is not visible”, időtúllépés). A program most megvárja, hogy a
  portál betöltésjelzője eltűnjön, a gombot a képernyőre görgeti, és többször próbálkozik. Ha egy postafiók
  mégsem nyílik meg, azt kihagyja, a hibát jelzi, és **a többi postafiókkal folytatja** (három egymás utáni
  hiba után áll le).
- **A kihagyott postafiókok listája nem működött**, ha a sorok „12345678 - Cégnév” alakban voltak megadva (a
  portál a neveket másképp írja). A program most az adószám alapján egyeztet; adószám nélkül továbbra is a
  névrészlet szerint.
- A kezelőfelület a listamezőket (pl. kihagyott postafiókok, címzettek) **vesszőnél is szétvágta**, ezért a
  vesszőt tartalmazó cégnevek szétestek. Most csak a sortörés választ el két tételt.
- Az Áttekintés nem mutatta az utolsó futás letöltés nélküli értesítéseinek számát; most mutatja.
- Az Áttekintés oldalon a lenyitott hibarészlet az 5 másodpercenkénti frissítéskor bezáródott; most nyitva
  marad.

### Frissítés előtt

- **A kihagyott postafiókok mostantól valóban kimaradnak.** Ha a listádban sok „adószám - név” sor van, azokat a
  postafiókokat a program az új verzióban már nem nézi. Az első futás előtt nézd át a **Postafiókok** lapon,
  melyik postafiók milyen módban van, és állítsd át, amit kell.
- A **próbafutás** is letölti az új leveleket (ez átvételnek számít). A „Csak értesítés” és a „Kihagy” módú
  postafiókokból a próbafutás sem tölt le semmit.
- A README letöltő gombjai mostantól a legfrissebb kiadás oldalára visznek (a fájlnevekben ott a verzió).
- Macen az első indításkor a rendszer újra rákérdezhet a megnyitásra és a Node hozzáférésére: engedélyezd.

## v0.4.0 – 2026-10-30

Első kiadás: Cégkapu-tárhelyek új leveleinek letöltése és továbbítása a felelős könyvelőnek, határidő-felismerés
(OCR-rel), Excel-napló, helyi kezelőfelület, ütemezés (Feladatütemező / launchd), Windows- és Mac-telepítő.
