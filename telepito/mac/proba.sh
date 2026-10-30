#!/bin/bash
# A kész DMG kipróbálása valódi Macen: felcsatolás, másolás, a kezelőfelület indítása az
# alkalmazás-indítóval, ütemezés a launchd-ben, valódi ütemezett futás, takarítás.
# Bármilyen eltérésnél hibával áll le. Futtatás: bash telepito/mac/proba.sh <dmg>
set -uo pipefail

DMG="${1:?Add meg a DMG útvonalát}"
WORK="$(mktemp -d)"
MOUNT="$WORK/dmg"
DATA="$WORK/adat-mappa"
LABEL="hu.iroda.tarhely-proba"
UID_="$(id -u)"
FAILS=0
mkdir -p "$MOUNT" "$DATA"

ok() { echo "ok: $1"; }
fail() { echo "HIBA: $1"; FAILS=$((FAILS + 1)); }
check() { if eval "$2"; then ok "$1"; else fail "$1"; fi; }

cleanup() {
  launchctl bootout "gui/$UID_/$LABEL" >/dev/null 2>&1
  launchctl enable "gui/$UID_/$LABEL" >/dev/null 2>&1
  rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
  pkill -f "$WORK/Applications" >/dev/null 2>&1
  hdiutil detach "$MOUNT" -quiet -force >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

export TARHELY_BEALLITASOK="$DATA/beallitasok.json"
export TARHELY_NINCS_BONGESZO=1
export TARHELY_UTEMEZES_CIMKE="$LABEL"

echo "== Felcsatolás és másolás"
hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MOUNT" -quiet || { echo "HIBA: a DMG nem csatolható fel"; exit 1; }
check "az Applications-hivatkozás és az útmutató ott van" '[ -e "$MOUNT/Applications" ] && [ -f "$MOUNT/OLVASD-EL.txt" ]'
mkdir -p "$WORK/Applications"
cp -R "$MOUNT/Tarhely-figyelo.app" "$WORK/Applications/"
APP="$WORK/Applications/Tarhely-figyelo.app"
RES="$APP/Contents/Resources"
check "a hordozható Node ott van és fut" '"$RES/node/bin/node" -v >/dev/null'
check "a program ott van" '[ -f "$RES/src/cli.ts" ]'
check "a Chromium ott van" 'ls -d "$RES"/browsers/chromium-* >/dev/null 2>&1'
check "az ikon és az Info.plist rendben" 'plutil -lint "$APP/Contents/Info.plist" >/dev/null && [ -f "$RES/Tarhely.icns" ]'
check "az aláírás érvényes" 'codesign --verify "$APP"'

echo "== Kezelőfelület az alkalmazás-indítóval"
"$APP/Contents/MacOS/Tarhely-figyelo"
for i in $(seq 1 60); do [ -f "$DATA/felulet.json" ] && break; sleep 0.5; done
if [ ! -f "$DATA/felulet.json" ]; then
  cat "$HOME/Library/Logs/Tarhely-figyelo/felulet.log" 2>/dev/null | tail -20
  echo "HIBA: a kezelőfelület nem indult el"; exit 1
fi
NODE="$RES/node/bin/node"
PORT="$("$NODE" -p "require('$DATA/felulet.json').port")"
TOKEN="$("$NODE" -p "require('$DATA/felulet.json').token")"
BASE="http://127.0.0.1:$PORT"
JAR="$WORK/jar"
json() { "$NODE" -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(eval('j.'+process.argv[1]))})" "$1"; }
api() { curl -fsS -b "$JAR" -H "x-tarhely: 1" -H "content-type: application/json" "$@"; }

curl -s -o /dev/null -c "$JAR" "$BASE/?k=$TOKEN"
check "az oldal betölt" 'curl -fsS -b "$JAR" "$BASE/" | grep -q "Tárhely-figyelő"'
check "belépés nélkül nem elérhető" '[ "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/allapot")" != "200" ]'
check "idegen Host-fejléccel elutasítja" '[ "$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -H "Host: evil.example" "$BASE/api/allapot")" != "200" ]'
"$APP/Contents/MacOS/Tarhely-figyelo"; sleep 3
# A második indítás csak megnyitja a futó példányt, és kilép; lassú gépen ez tovább tarthat, ezért várunk rá.
for i in $(seq 1 40); do
  [ "$(pgrep -f "$RES/node/bin/node.*felulet" | wc -l | tr -d " ")" = 1 ] && break
  sleep 0.5
done
check "az alkalmazás-indító újraindítva csak megnyitja a futó példányt (egy kiszolgáló fut)" '[ "$(pgrep -f "$RES/node/bin/node.*felulet" | wc -l | tr -d " ")" = 1 ] && [ -f "$DATA/felulet.json" ]'

ALLAPOT="$(api "$BASE/api/allapot")"
check "a kezdő beállításfájl létrejött és érvényes" '[ "$(echo "$ALLAPOT" | json "kesz")" = "true" ]'
check "a felület látja a Chromiumot" '[ "$(echo "$ALLAPOT" | json "ellenorzes.find(x=>x.id===\"chromium\").ok")" = "true" ]'
check "a minta céglista létrejött" '[ "$(echo "$ALLAPOT" | json "ellenorzes.find(x=>x.id===\"ceglista\").ok")" = "true" ]'
check "az ütemezés támogatott (launchd)" '[ "$(echo "$ALLAPOT" | json "utemezes.supported")" = "true" ]'

echo "== Ütemezés a felületről"
U="$(api -X POST "$BASE/api/utemezes" -d '{"idopontok":["07:30","13:15"],"bekapcsolva":true}')"
check "az új időpontok: $(echo "$U" | json "times.join(', ')")" '[ "$(echo "$U" | json "times.join(\",\")")" = "07:30,13:15" ]'
check "a launchd betöltötte a feladatot" 'launchctl print "gui/$UID_/$LABEL" >/dev/null 2>&1'
check "a plist a beállításfájlt rögzíti" 'grep -q "$DATA/beallitasok.json" "$HOME/Library/LaunchAgents/$LABEL.plist"'

echo "== Művelet a felületről (ellenőrzés)"
api -X POST "$BASE/api/muvelet" -d '{"nev":"ellenorzes"}' >/dev/null
for i in $(seq 1 60); do
  M="$(api "$BASE/api/muvelet")"
  [ "$(echo "$M" | json "running")" = "false" ] && break
  sleep 1
done
check "az ellenőrzés befejeződött" '[ "$(echo "$M" | json "running")" = "false" ]'
echo "$M" | json "lines.map(l=>'  '+l).join('\n')"
check "az ellenőrzés a telepített programmal lefutott (Céglista: 1 cég)" 'echo "$M" | json "lines.join(\"\n\")" | grep -q "Céglista: 1 cég"'

echo "== Valódi ütemezett indítás (launchd -> futtatas.sh -> Node)"
rm -f "$DATA/adat/utolso-futas.json"
launchctl kickstart "gui/$UID_/$LABEL"
VEGE=0
for i in $(seq 1 90); do
  if [ -f "$DATA/adat/utolso-futas.json" ] && [ -n "$("$NODE" -p "require('$DATA/adat/utolso-futas.json').finishedAt || ''")" ]; then VEGE=1; break; fi
  sleep 1
done
check "az ütemezett feladat elindította a programot (utolso-futas.json megjelent)" '[ "$VEGE" = 1 ]'
cat "$DATA/adat/utolso-futas.json" 2>/dev/null; echo

echo "== Ütemezés kikapcsolása, bekapcsolása, törlése"
api -X POST "$BASE/api/utemezes/kapcsol" -d '{"bekapcsolva":false}' >/dev/null
check "kikapcsolva nincs betöltve" '! launchctl print "gui/$UID_/$LABEL" >/dev/null 2>&1'
api -X POST "$BASE/api/utemezes/kapcsol" -d '{"bekapcsolva":true}' >/dev/null
check "bekapcsolva újra betöltve" 'launchctl print "gui/$UID_/$LABEL" >/dev/null 2>&1'
api -X POST "$BASE/api/utemezes/torles" -d '{}' >/dev/null
check "törlés után nincs plist és nincs betöltve" '[ ! -f "$HOME/Library/LaunchAgents/$LABEL.plist" ] && ! launchctl print "gui/$UID_/$LABEL" >/dev/null 2>&1'

if [ "$FAILS" -ne 0 ]; then echo "$FAILS HIBA"; exit 1; fi
echo "MINDEN RENDBEN"
