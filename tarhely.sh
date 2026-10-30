#!/bin/sh
# A Tarhely-figyelo parancssori indito macOS-re (kezelofelulet, utemezes, futtatas...).
# A sajat mappajabol indul; telepitett valtozatban a mellette levo Node-ot es
# bongeszot hasznalja, a beallitasokat pedig a felhasznaloi adatmappabol olvassa.
DIR=$(cd "$(dirname "$0")" && pwd)
cd "$DIR" || exit 1
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
NODE=node
[ -x "$DIR/node/bin/node" ] && NODE="$DIR/node/bin/node"
[ -d "$DIR/browsers" ] && export PLAYWRIGHT_BROWSERS_PATH="$DIR/browsers"
if [ -f "$DIR/telepitett.txt" ] && [ -z "$TARHELY_BEALLITASOK" ]; then
  export TARHELY_BEALLITASOK="$HOME/Library/Application Support/Tarhely-figyelo/beallitasok.json"
fi
exec "$NODE" src/cli.ts "$@"
