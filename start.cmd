@echo off
cd /d "%~dp0"
set "PATH=C:\Users\Duong\.qoder\tmp\tools\node-v24.22.1-win-x64;%PATH%"
call npm run dev -- --open
pause
