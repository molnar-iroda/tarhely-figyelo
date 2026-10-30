#!/bin/sh
# Utemezett futtatashoz (macOS launchd).
exec "$(dirname "$0")/tarhely.sh" futtatas "$@"
