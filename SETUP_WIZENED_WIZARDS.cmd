@echo off
setlocal
title Wizened Wizards - One-time setup
cd /d "%~dp0"
echo.
echo  ==========================================
echo    WIZENED WIZARDS - one-time setup
echo  ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js was not found.
  echo      Install the LTS version from https://nodejs.org/ ^(version 20 or newer^),
  echo      then run this file again.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo  Found Node.js %NODEVER%
echo.
echo  Installing dependencies (needs internet this one time)...
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 (
  echo  npm ci failed, trying npm install...
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo  [!] Could not install dependencies. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo.
echo  Building the game...
call npm.cmd run build
if errorlevel 1 (
  echo  [!] The build failed. See the messages above.
  pause
  exit /b 1
)
echo.
echo  Setup complete! Double-click PLAY_WIZENED_WIZARDS.cmd to play - no internet needed.
echo.
pause
exit /b 0
