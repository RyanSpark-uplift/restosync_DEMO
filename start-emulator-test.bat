@echo off
REM ============================================================
REM RestoSync — Android Emulator Test Bootstrap
REM  TV    : AndroidTV_API34 emulator + native RN app (com.restosync.tv)
REM  Tablet: Pixel_3a emulator + Chrome -^> http://localhost:8082 (expo web)
REM  API   : http://localhost:3000
REM Usage : double-click this file, OR run from project root
REM ============================================================

setlocal enabledelayedexpansion

set "ADB=C:\platform-tools\platform-tools\adb.exe"
set "EMU=C:\Users\hgpar\AppData\Local\Android\Sdk\emulator\emulator.exe"
set "AVD_TV=AndroidTV_API34"
set "AVD_TABLET=Pixel_3a_API_34_extension_level_7_x86_64"
set "TV_SERIAL=emulator-5554"
set "TABLET_SERIAL=emulator-5556"
set "PROJ=%~dp0"
set "PROJ=%PROJ:~0,-1%"

cd /d "%PROJ%"

REM ---------- [0] Reset adb server (avoid "protocol fault") ----------
echo.
echo === [0/8] Reset adb server ===
"%ADB%" kill-server >nul 2>&1
"%ADB%" start-server >nul 2>&1

REM ---------- [1] Docker ----------
echo.
echo === [1/8] Docker (postgres + redis) ===
docker compose up -d
if errorlevel 1 echo [WARN] Docker compose failed. Make sure Docker Desktop is running.

REM ---------- [2] Boot emulators ----------
echo.
echo === [2/8] Boot AndroidTV emulator ===
"%ADB%" devices | find /i "%TV_SERIAL%" >nul
if errorlevel 1 (
  start "AndroidTV" "%EMU%" -avd %AVD_TV% -no-snapshot-save -no-boot-anim
) else (
  echo TV emulator already running.
)

echo.
echo === [3/8] Boot Tablet emulator ===
"%ADB%" devices | find /i "%TABLET_SERIAL%" >nul
if errorlevel 1 (
  start "Tablet" "%EMU%" -avd %AVD_TABLET% -no-snapshot-save -no-boot-anim
) else (
  echo Tablet emulator already running.
)

REM ---------- [4] Wait for devices ----------
echo.
echo === [4/8] Wait for both devices to register ===
:WAIT_REGISTER
for /f "usebackq tokens=*" %%i in (`"%ADB%" devices ^| find /c "emulator-"`) do set "N=%%i"
if !N! lss 2 (
  timeout /t 3 /nobreak >nul
  goto WAIT_REGISTER
)

echo.
echo === [5/8] Wait for boot_completed ===
for %%D in (%TV_SERIAL% %TABLET_SERIAL%) do call :WAIT_BOOT %%D
goto AFTER_BOOT

:WAIT_BOOT
set "BOOT="
for /f "usebackq tokens=*" %%b in (`"%ADB%" -s %1 shell getprop sys.boot_completed 2^>nul`) do set "BOOT=%%b"
if not "!BOOT!"=="1" (
  timeout /t 3 /nobreak >nul
  goto WAIT_BOOT
)
echo   %1 booted.
exit /b 0

:AFTER_BOOT

REM ---------- [6] adb reverse ----------
echo.
echo === [6/8] adb reverse: API(3000) + TV Metro(8081) + Tablet Web(8082) ===
for %%D in (%TV_SERIAL% %TABLET_SERIAL%) do (
  "%ADB%" -s %%D reverse tcp:3000 tcp:3000 >nul
  "%ADB%" -s %%D reverse tcp:8081 tcp:8081 >nul
  "%ADB%" -s %%D reverse tcp:8082 tcp:8082 >nul
  echo   %%D : 3000 / 8081 / 8082 reversed
)

REM ---------- [7] Servers ----------
echo.
echo === [7/8] Start servers (separate windows if not already up) ===

REM Check API
curl -s -o nul -w "%%{http_code}" http://localhost:3000/health > "%TEMP%\_api.txt"
set /p API_CODE=<"%TEMP%\_api.txt"
del "%TEMP%\_api.txt" >nul 2>&1
if "!API_CODE!"=="200" (
  echo   API already running on :3000
) else (
  start "RestoSync API" cmd /k "cd /d %PROJ% && pnpm --filter @restosync/api dev"
)

REM Check TV Metro (port 8081)
curl -s -o nul -w "%%{http_code}" http://localhost:8081/status > "%TEMP%\_tv.txt"
set /p TV_CODE=<"%TEMP%\_tv.txt"
del "%TEMP%\_tv.txt" >nul 2>&1
if "!TV_CODE!"=="200" (
  echo   TV Metro already running on :8081
) else (
  start "TV Metro" cmd /k "cd /d %PROJ% && pnpm --filter @restosync/tv start"
)

REM Check Tablet Expo Web (port 8082)
curl -s -o nul -w "%%{http_code}" http://localhost:8082 > "%TEMP%\_tb.txt"
set /p TB_CODE=<"%TEMP%\_tb.txt"
del "%TEMP%\_tb.txt" >nul 2>&1
if "!TB_CODE!"=="200" (
  echo   Tablet Expo Web already running on :8082
) else (
  start "Tablet Expo Web" cmd /k "cd /d %PROJ%\apps\tablet && pnpm exec expo start --web --port 8082 --clear"
)

echo.
echo Waiting 12s for servers to come up...
timeout /t 12 /nobreak >nul

REM ---------- [8] Launch apps on emulators ----------
echo.
echo === [8/8] Launch apps ===

REM TV: native app (install if missing)
"%ADB%" -s %TV_SERIAL% shell pm list packages | find "com.restosync.tv" >nul
if errorlevel 1 (
  echo   TV app not installed -^> running pnpm tv android...
  cmd /c "cd /d %PROJ% && set ANDROID_SERIAL=%TV_SERIAL% && pnpm --filter @restosync/tv android"
) else (
  echo   TV app installed -^> launching com.restosync.tv
  "%ADB%" -s %TV_SERIAL% shell am start -n com.restosync.tv/.MainActivity >nul
)

REM Tablet: open Chrome -> tablet web URL
echo   Tablet -^> opening Chrome to http://localhost:8082
"%ADB%" -s %TABLET_SERIAL% shell am start -a android.intent.action.VIEW -d "http://localhost:8082" com.android.chrome >nul

echo.
echo ============================================================
echo  All up. Use these in the apps:
echo.
echo    API URL : http://localhost:3000   (works thanks to adb reverse)
echo    License : RS-TEST-0001-AAAA:dev
echo    PIN     : 1234
echo.
echo  To stop: run stop-emulator-test.bat
echo ============================================================
endlocal
