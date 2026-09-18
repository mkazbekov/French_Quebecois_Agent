@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Quebec French Tutor

rem Resolve the script's own folder ONCE, in a plain (non-block) line, then
rem use !SCRIPT_DIR! (delayed expansion) everywhere below instead of %~dp0 or
rem %SCRIPT_DIR%. This folder name can contain spaces, accents, or even
rem parentheses (e.g. a browser-renamed "Downloads (1)" folder) - if such a
rem path is substituted with %VAR% *inside* an if/for ( ... ) block, cmd's
rem parser can mistake the embedded ( or ) for block syntax and break. Values
rem substituted with !VAR! (delayed expansion) are only inserted at the
rem moment a line actually runs, well after the block's own structure has
rem already been parsed, so they can't confuse it.
set "SCRIPT_DIR=%~dp0"
if "!SCRIPT_DIR:~-1!"=="\" set "SCRIPT_DIR=!SCRIPT_DIR:~0,-1!"
cd /d "!SCRIPT_DIR!"

rem --- 0. Were we double-clicked from inside the still-zipped download? ---
if not exist "!SCRIPT_DIR!\scripts\launch.mjs" (
  echo.
  echo It looks like you opened this from inside the ZIP file.
  echo Close this window, right-click the downloaded ZIP, choose "Extract All...",
  echo then open the extracted folder and double-click Start Tutor ^(Windows^).bat again.
  pause
  exit /b 1
)

rem Pinned portable Node.js version used only if no suitable Node is found.
set "NODE_VERSION=v24.18.0"
set "RUNTIME_DIR=!SCRIPT_DIR!\.runtime"
set "NODE_DIR=!RUNTIME_DIR!\node"

set "NODE_EXE="

rem --- 1. Already have a portable copy from a previous run? ---
if exist "!NODE_DIR!\node.exe" (
  set "NODE_EXE=!NODE_DIR!\node.exe"
  goto :haveNode
)

rem --- 2. Is there a good-enough Node.js already on PATH? ---
where node >nul 2>&1
if !errorlevel!==0 (
  set "SYSVER="
  for /f "usebackq delims=v" %%V in (`node -v 2^>nul`) do set "SYSVER=%%V"
  set "SYSMAJOR=0"
  set "SYSMINOR=0"
  if defined SYSVER (
    for /f "tokens=1,2 delims=." %%a in ("!SYSVER!") do (
      set "SYSMAJOR=%%a"
      set "SYSMINOR=%%b"
    )
  )
  set "SYSOK="
  if !SYSMAJOR! GTR 20 set "SYSOK=1"
  if !SYSMAJOR! EQU 20 if !SYSMINOR! GEQ 9 set "SYSOK=1"
  if defined SYSOK (
    set "NODE_EXE=node"
    goto :haveNode
  )
)

rem --- 3. Download a portable copy of Node.js (no admin rights needed) ---
echo.
echo Node.js was not found on this computer (or the version is too old).
echo Downloading Node.js (about 30 MB, only needed the first time)...
echo.

if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
  set "NODE_ARCH=arm64"
) else (
  set "NODE_ARCH=x64"
)

if not exist "!RUNTIME_DIR!" mkdir "!RUNTIME_DIR!"
set "ZIP_PATH=!RUNTIME_DIR!\node.zip"
set "NODE_URL=https://nodejs.org/dist/!NODE_VERSION!/node-!NODE_VERSION!-win-!NODE_ARCH!.zip"

curl.exe -fL --progress-bar -o "!ZIP_PATH!" "!NODE_URL!"
if errorlevel 1 (
  echo.
  echo Could not download Node.js !NODE_VERSION! - looking up the latest version instead...
  set "FOUND_VERSION="
  for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "try { (Invoke-RestMethod https://nodejs.org/dist/index.json | Where-Object { $_.version -like 'v24.*' } | Select-Object -First 1).version } catch { '' }"`) do set "FOUND_VERSION=%%V"
  if not defined FOUND_VERSION (
    echo.
    echo Sorry, we could not download Node.js automatically.
    echo Please check your internet connection ^(and that antivirus / a firewall
    echo is not blocking curl or nodejs.org^), then try again.
    echo You can also install Node.js yourself from https://nodejs.org and re-run
    echo this launcher.
    pause
    exit /b 1
  )
  set "NODE_VERSION=!FOUND_VERSION!"
  set "NODE_URL=https://nodejs.org/dist/!NODE_VERSION!/node-!NODE_VERSION!-win-!NODE_ARCH!.zip"
  curl.exe -fL --progress-bar -o "!ZIP_PATH!" "!NODE_URL!"
  if errorlevel 1 (
    echo.
    echo Still could not download Node.js. Please check your internet connection
    echo and try again, or install Node.js yourself from https://nodejs.org
    pause
    exit /b 1
  )
)

echo Extracting Node.js...
tar.exe -xf "!ZIP_PATH!" -C "!RUNTIME_DIR!"
if errorlevel 1 (
  echo.
  echo Failed to extract the downloaded Node.js archive.
  pause
  exit /b 1
)

rem The archive extracts to a folder like node-vX.Y.Z-win-x64; rename it.
for /d %%D in ("!RUNTIME_DIR!\node-*") do (
  move /y "%%D" "!NODE_DIR!" >nul
)
del "!ZIP_PATH!" >nul 2>&1

if not exist "!NODE_DIR!\node.exe" (
  echo.
  echo Something went wrong setting up Node.js.
  pause
  exit /b 1
)
set "NODE_EXE=!NODE_DIR!\node.exe"

:haveNode
rem Make sure npm/next (spawned by launch.mjs) also see the right node first.
if exist "!NODE_DIR!\node.exe" set "PATH=!NODE_DIR!;%PATH%"

"!NODE_EXE!" "!SCRIPT_DIR!\scripts\launch.mjs" %*
set "LAUNCH_RESULT=!errorlevel!"

if not "!LAUNCH_RESULT!"=="0" (
  echo.
  echo Something went wrong - read the message above.
  pause
)

exit /b !LAUNCH_RESULT!
