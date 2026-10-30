@echo off
rem A Tarhely-figyelo parancssori indito (kezelofelulet, utemezes, futtatas...).
rem A sajat mappajabol indul; telepitett valtozatban a mellette levo Node-ot es
rem bongeszot hasznalja, a beallitasokat pedig a felhasznaloi adatmappabol olvassa.
cd /d "%~dp0"
set "NODE=node"
if exist "%~dp0node\node.exe" set "NODE=%~dp0node\node.exe"
if exist "%~dp0browsers" set "PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers"
if exist "%~dp0telepitett.txt" if not defined TARHELY_BEALLITASOK set "TARHELY_BEALLITASOK=%APPDATA%\Tarhely-figyelo\beallitasok.json"
"%NODE%" src\cli.ts %*
exit /b %errorlevel%
