@echo off
cd /d "%~dp0"
set "CF=C:\Users\Duong\.qoder\tmp\tools\cloudflared.exe"
if not exist "%CF%" (
  echo Downloading cloudflared...
  if not exist "C:\Users\Duong\.qoder\tmp\tools" mkdir "C:\Users\Duong\.qoder\tmp\tools"
  curl.exe -L --fail -o "%CF%" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  if errorlevel 1 (
    echo Download failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo.
echo Make sure the game is running in another window: start.cmd
echo Keep this window open while friends play.
echo Share the trycloudflare.com URL printed below. It changes every restart.
echo.
"%CF%" tunnel --url http://localhost:5173
pause
