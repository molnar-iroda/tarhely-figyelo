@echo off
rem Utemezett futtatashoz (Windows Feladatutemezo).
call "%~dp0tarhely.cmd" futtatas %*
exit /b %errorlevel%
