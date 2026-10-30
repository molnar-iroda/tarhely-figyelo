#!/bin/bash
# A macOS-telepítő (DMG) összeállítása: Tarhely-figyelo.app hordozható Node.js-szel,
# Chromiummal és a programmal. Futtatás Macen: bash telepito/mac/epit.sh [arm64|x64]
# Kimenet: telepito/kimenet/Tarhely-figyelo-mac-<arch>-<verzió>.dmg
set -euo pipefail

ARCH="${1:-$(uname -m)}"
case "$ARCH" in
  arm64|aarch64) ARCH=arm64 ;;
  x64|x86_64) ARCH=x64 ;;
  *) echo "Ismeretlen architektúra: $ARCH" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
VERZIO="$(node -p "require('./package.json').version")"
STAGE="$ROOT/telepito/stage-mac"
APP="$STAGE/Tarhely-figyelo.app"
RES="$APP/Contents/Resources"
OUT="$ROOT/telepito/kimenet"
rm -rf "$STAGE"
mkdir -p "$RES" "$APP/Contents/MacOS" "$OUT"

echo "== Program másolása"
for e in src package.json package-lock.json beallitasok.minta.json tarhely.sh futtatas.sh UTMUTATO.md README.md LICENSE THIRD_PARTY.md; do
  cp -R "$e" "$RES/$e"
done
echo "Telepített változat: a beállítások a ~/Library/Application Support/Tarhely-figyelo mappában vannak." > "$RES/telepitett.txt"
chmod +x "$RES/tarhely.sh" "$RES/futtatas.sh"

echo "== Függőségek (csak éles, $ARCH)"
(cd "$RES" && npm ci --omit=dev --no-audit --no-fund)

echo "== Node.js (hordozható, $ARCH)"
NODE_VERSION="$(node -e "fetch('https://nodejs.org/dist/index.json').then(r=>r.json()).then(l=>console.log(l.find(v=>v.version.startsWith('v22.')).version))")"
echo "Node $NODE_VERSION"
TMP="$(mktemp -d)"
curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-darwin-$ARCH.tar.gz" -o "$TMP/node.tgz"
tar -xzf "$TMP/node.tgz" -C "$TMP"
mkdir -p "$RES/node/bin"
cp "$TMP/node-$NODE_VERSION-darwin-$ARCH/bin/node" "$RES/node/bin/node"
rm -rf "$TMP"

echo "== Chromium"
PLAYWRIGHT_BROWSERS_PATH="$RES/browsers" "$RES/node/bin/node" "$RES/node_modules/playwright/cli.js" install chromium

echo "== Alkalmazás-csomag"
cp telepito/mac/Tarhely.icns "$RES/Tarhely.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Tarhely-figyelo</string>
  <key>CFBundleDisplayName</key><string>Tárhely-figyelő</string>
  <key>CFBundleIdentifier</key><string>hu.iroda.tarhely-figyelo</string>
  <key>CFBundleExecutable</key><string>Tarhely-figyelo</string>
  <key>CFBundleIconFile</key><string>Tarhely</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERZIO</string>
  <key>CFBundleVersion</key><string>$VERZIO</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST
# Az indító elindítja a kezelőfelületet a háttérben, és azonnal kilép (így az ikonra
# újra kattintva mindig új indítás történik: a futó példány csak megnyitja a böngészőt).
cat > "$APP/Contents/MacOS/Tarhely-figyelo" <<'LAUNCHER'
#!/bin/sh
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
LOG="$HOME/Library/Logs/Tarhely-figyelo"
mkdir -p "$LOG"
nohup "$RES/tarhely.sh" felulet >>"$LOG/felulet.log" 2>&1 &
exit 0
LAUNCHER
chmod +x "$APP/Contents/MacOS/Tarhely-figyelo"
# Ad-hoc aláírás (Apple Developer-fiók nélkül ennyi lehetséges); a Gatekeeper így is rákérdez az első megnyitáskor.
codesign --force --sign - "$APP"
codesign --verify "$APP"

echo "== DMG"
DMG_DIR="$STAGE/dmg"
mkdir -p "$DMG_DIR"
cp -R "$APP" "$DMG_DIR/"
ln -s /Applications "$DMG_DIR/Applications"
cat > "$DMG_DIR/OLVASD-EL.txt" <<'TXT'
Tárhely-figyelő telepítése

1. Húzd a Tarhely-figyelo ikont az Applications mappára.
2. Az első megnyitáskor a Mac figyelmeztethet, mert a program nincs Apple-aláírással ellátva:
   - nyisd meg a Rendszerbeállítások > Adatvédelem és biztonság oldalt, görgess le, és kattints
     a „Megnyitás mindenképp” gombra a Tarhely-figyelo mellett; vagy
   - Terminálban: xattr -dr com.apple.quarantine /Applications/Tarhely-figyelo.app
3. Utána a kezelőfelület a böngészőben nyílik meg; az „Üzembe helyezés” lista végigvezet a beállításokon.

A beállítások és a letöltött levelek: ~/Library/Application Support/Tarhely-figyelo
Eltávolítás: előbb az Ütemezés oldalon az „Ütemezés törlése”, aztán a Tarhely-figyelo ikon kukába húzása.
TXT
DMG="$OUT/Tarhely-figyelo-mac-$ARCH-$VERZIO.dmg"
rm -f "$DMG"
hdiutil create -volname "Tarhely-figyelo" -srcfolder "$DMG_DIR" -ov -format UDZO "$DMG" >/dev/null
ls -la "$OUT"/*.dmg
