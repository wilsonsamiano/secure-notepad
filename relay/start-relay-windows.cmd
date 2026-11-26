@echo off
rem MavPad relay for Windows: double-click this file. Keep the window open while you want sync.
title MavPad relay
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed yet.
  echo Opening the download page. Install the LTS version, then double-click this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

if not exist "node_modules\ws" (
  echo Installing the relay ^(first run only^)...
  call npm install --omit=dev
  if errorlevel 1 (
    echo Install failed. Check the internet connection and try again.
    pause
    exit /b 1
  )
)

set "TS=tailscale"
where tailscale >nul 2>nul
if errorlevel 1 set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
if exist "%TS%" goto funnel
where tailscale >nul 2>nul
if errorlevel 1 (
  echo.
  echo Tailscale was not found. Install it from https://tailscale.com/download and sign in,
  echo then double-click this file again.
  start "" https://tailscale.com/download
  pause
  exit /b 1
)
:funnel
echo.
echo Publishing the relay with Tailscale Funnel...
echo If a link appears below, open it and approve Funnel, then come back.
"%TS%" funnel --bg 8787
echo.
echo ================================================================
echo  Type this address into MavPad: Settings, Relays, Add relay
echo  ^(use the https:// address shown above, without "https://"^)
echo  Keep this window open. Closing it stops the relay.
echo  To stop the public address later: tailscale funnel --bg off
echo ================================================================
echo.
set RELAY_NAME=elitebook
node server.js
pause
