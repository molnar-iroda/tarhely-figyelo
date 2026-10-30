# Beemelt kód: tarhely-cli

A mappa a [godavid/tarhely-cli](https://github.com/godavid/tarhely-cli) projekt
forráskódjának egy része (MIT-licenc, lásd `LICENSE`), a
`004d769ad6f860b028cc8f2d57c923c3ec149527` commit (2026-10-23) állapotában.
Ez végzi az Ügyfélkapu+ belépést, a postafiókok listázását és a levelek
letöltését.

Azért van beemelve és nem függőségként behúzva, mert a csomag nincs kiadva
az npm-en, és mert így a belépést kezelő kód pontosan ellenőrizhető, nem
frissül magától.

## Eltérés az eredetitől

Egyetlen gépi változtatás: a relatív importok `.js` helyett `.ts`
kiterjesztésre mutatnak, hogy a Node.js fordítás nélkül futtathassa. A
tartalom egyébként változatlan; ha a portál változása miatt az eredeti
projekt javítást ad ki, a fájlok ugyanígy frissíthetők.

Kimaradt: a parancssori rész (`cli.ts`, `main.ts`, `commands/`) és az
`outdir.ts`; ezek helyett a saját `src/` modulok szolgálnak.
