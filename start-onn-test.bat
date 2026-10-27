@echo off
REM ============================================================
REM RestoSync - Low-heat test bootstrap (NO emulators)
REM   Tablet : laptop browser  -^> http://localhost:8082 (expo web)
REM   TV     : physical Walmart Onn 4K (Google TV) over network adb
REM   API    : http://localhost:3000
REM
REM Why: running two Android emulators overheats the LG gram and
REM      triggers reboots. This script boots ZERO emulators.
REM
REM Onn IP : pass as arg ->  start-onn-test.bat 192.168.1.50
REM          or it is read from .onn-device (saved on first run)
REM
REM Prereq on the Onn (one time):
REM   Settings ^> System ^> About ^> tap "Android TV OS build" 7x
REM   Settings ^> System ^> Developer options ^> turn on
REM     "USB debugging" AND "Network debugging" (ADB over network)
REM   The Onn must be on the SAME Wi-Fi/LAN as this laptop.
REM ============================================================

setlocal enabledelayedexpansion

set "ADB=C:\platform-tools\platform-tools\adb.exe"
set "PROJ=%~dp0"
set "PROJ=%PROJ:~0,-1%"
set "ONN_PORT=5555"
set "IPFILE=%PROJ%\.onn-device"

cd /d "%PROJ%"

REM ---------- Resolve Onn IP: arg > saved file > prompt ----------
set "ONN_IP="
if not "%~1"=="" set "ONN_IP=%~1"
if not defined ONN_IP if exist "%IPFILE%" set /p ONN_IP=<"%IPFILE%"
if not defined ONN_IP set /p ONN_IP=Enter Onn 4K IP address (e.g. 192.168.1.50):
if not defined ONN_IP echo [ERROR] No Onn IP. Usage: start-onn-test.bat 192.168.1.50 & goto :END
> "%IPFILE%" echo %ONN_IP%
set "ONN_SERIAL=%ONN_IP%:%ONN_PORT%"

echo.
echo ============================================================
echo  Onn 4K target : %ONN_SERIAL%
echo  Tablet        : laptop browser (no emulator)
echo ============================================================

REM ---------- [0] Reset adb server ----------
echo.
echo === [0/7] Reset adb server ===
"%ADB%" kill-server >nul 2>&1
"%ADB%" start-server >nul 2>&1

REM ---------- [1] Docker ----------
echo.
echo === [1/7] Docker (postgres + redis) ===
docker compose up -d
if errorlevel 1 echo [WARN] Docker compose failed. Make sure Docker Desktop is running.

REM ---------- [2] Connect to Onn 4K (first connect needs on-TV approval) ----------
echo.
echo === [2/7] Connect to Onn 4K over network ===
echo   Connecting to %ONN_SERIAL% ...
echo   FIRST TIME? Watch the TV: an "Allow debugging from this computer?" box
echo   appears -- check "Always allow from this computer" and select OK.
set "ONN_OK="
set "ST="
for /l %%t in (1,1,12) do (
  if not defined ONN_OK (
    "%ADB%" connect %ONN_SERIAL% >nul 2>&1
    set "ST="
    for /f "usebackq tokens=*" %%s in (`"%ADB%" -s %ONN_SERIAL% get-state 2^>nul`) do set "ST=%%s"
    if /i "!ST!"=="device" set "ONN_OK=1"
    if /i "!ST!"=="unauthorized" echo   waiting for you to approve the prompt on the TV...
    if not defined ONN_OK timeout /t 3 /nobreak >nul
  )
)
if defined ONN_OK (
  echo   Onn connected: %ONN_SERIAL%
) else (
  echo.
  echo [WARN] Onn not connected ^(last state: "!ST!"^).
  if /i "!ST!"=="unauthorized" echo        Prompt was not approved on the TV. Re-run and accept it.
  echo        If NO prompt ever appeared, port 5555 is not open. On the Onn:
  echo          Developer options ^> enable "Wireless debugging", then on this PC:
  echo            adb pair ^<ip^>:^<pair-port^>   ^(use the 6-digit code shown on TV^)
  echo            adb connect %ONN_SERIAL%
  echo        Verify the IP: Onn Settings ^> Network ^> your Wi-Fi ^> IP address.
  echo        Tablet will still come up; TV step is skipped.
)

REM ---------- [3] adb reverse (Onn -> laptop) ----------
echo.
echo === [3/7] adb reverse: API(3000) + TV Metro(8081) ===
if defined ONN_OK (
  "%ADB%" -s %ONN_SERIAL% reverse tcp:3000 tcp:3000 >nul
  "%ADB%" -s %ONN_SERIAL% reverse tcp:8081 tcp:8081 >nul
  echo   %ONN_SERIAL% : 3000 / 8081 reversed
) else (
  echo   skipped ^(Onn not connected^)
)

REM ---------- [4] Servers (separate windows if not already up) ----------
echo.
echo === [4/7] Start servers ===

REM API (3000)
curl -s -o nul -w "%%{http_code}" http://localhost:3000/health > "%TEMP%\_api.txt"
set /p API_CODE=<"%TEMP%\_api.txt"
del "%TEMP%\_api.txt" >nul 2>&1
if "!API_CODE!"=="200" (
  echo   API already running on :3000
) else (
  start "RestoSync API" cmd /k "cd /d %PROJ% && pnpm --filter @restosync/api dev"
)

REM TV Metro (8081) - native Onn app loads its JS bundle from here
curl -s -o nul -w "%%{http_code}" http://localhost:8081/status > "%TEMP%\_tv.txt"
set /p TV_CODE=<"%TEMP%\_tv.txt"
del "%TEMP%\_tv.txt" >nul 2>&1
if "!TV_CODE!"=="200" (
  echo   TV Metro already running on :8081
) else (
  start "TV Metro" cmd /k "cd /d %PROJ% && pnpm --filter @restosync/tv start"
)

REM Tablet Expo Web (8082)
curl -s -o nul -w "%%{http_code}" http://localhost:8082 > "%TEMP%\_tb.txt"
set /p TB_CODE=<"%TEMP%\_tb.txt"
del "%TEMP%\_tb.txt" >nul 2>&1
if "!TB_CODE!"=="200" (
  echo   Tablet Expo Web already running on :8082
) else (
  start "Tablet Expo Web" cmd /k "cd /d %PROJ%\apps\tablet && pnpm exec expo start --web --port 8082"
)

echo.
echo Waiting for servers to come up...
timeout /t 12 /nobreak >nul

REM ---------- [5] Open tablet in the laptop browser ----------
echo.
echo === [5/7] Open Tablet in laptop browser ===
set "TB_UP="
for /l %%i in (1,1,10) do (
  if not defined TB_UP (
    curl -s -o nul -w "%%{http_code}" http://localhost:8082 > "%TEMP%\_tb2.txt"
    set /p TB2=<"%TEMP%\_tb2.txt"
    del "%TEMP%\_tb2.txt" >nul 2>&1
    if "!TB2!"=="200" set "TB_UP=1"
    if not defined TB_UP timeout /t 3 /nobreak >nul
  )
)
start "" "http://localhost:8082"
echo   Opened http://localhost:8082

REM ---------- [6] Launch TV app on the Onn ----------
echo.
echo === [6/7] Launch TV app on Onn 4K ===
if not defined ONN_OK (
  echo   skipped ^(Onn not connected^)
  goto :SUMMARY
)
"%ADB%" -s %ONN_SERIAL% shell pm list packages | find "com.restosync.tv" >nul
if errorlevel 1 (
  echo   TV app not installed -^> building + installing ^(one-time, heavy^)...
  set "ANDROID_SERIAL=%ONN_SERIAL%"
  cmd /c "cd /d %PROJ% && pnpm --filter @restosync/tv android"
  set "ANDROID_SERIAL="
) else (
  echo   TV app installed -^> launching com.restosync.tv
  "%ADB%" -s %ONN_SERIAL% shell am start -n com.restosync.tv/.MainActivity >nul
)

:SUMMARY
echo.
echo === [7/7] Done ===
echo ============================================================
echo  Tablet  : http://localhost:8082  (laptop browser)
echo  TV      : %ONN_SERIAL%  (physical Onn 4K)
echo  API     : http://localhost:3000
echo.
echo  Login   : License RS-TEST-0001-AAAA   PIN 1234
echo            (drop the ":dev" suffix so TV target = onn_4k)
echo.
echo  Stop    : run stop-onn-test.bat
echo ============================================================
goto :END

:END
endlocal
