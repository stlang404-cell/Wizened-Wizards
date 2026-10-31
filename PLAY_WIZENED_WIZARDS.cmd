@echo off
setlocal
title Wizened Wizards
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] Node.js was not found. Install the LTS version from https://nodejs.org/
  echo      and then run SETUP_WIZENED_WIZARDS.cmd once.
  echo.
  pause
  exit /b 1
)
if not exist "%~dp0dist\index.html" (
  echo  The game has not been built yet. Running one-time setup...
  call "%~dp0SETUP_WIZENED_WIZARDS.cmd"
  if not exist "%~dp0dist\index.html" (
    echo  [!] Setup did not complete. Please run SETUP_WIZENED_WIZARDS.cmd and read any errors.
    pause
    exit /b 1
  )
)
echo.
echo  Starting Wizened Wizards... your browser will open shortly.
echo  Keep this window open while playing. Close it to stop the game.
echo.
node "%~dp0server\serve.mjs" --open
if errorlevel 1 (
  echo.
  echo  [!] The game server stopped with an error. See the message above.
  pause
)
