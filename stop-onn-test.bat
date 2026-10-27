@echo off
REM ============================================================
REM RestoSync — Stop low-heat (Onn) test environment
REM  - Disconnects the Onn 4K network adb session
REM  - Kills API / TV Metro / Tablet Expo Web dev servers
REM  - Leaves Docker containers running (use `docker compose down`)
REM  - Does NOT touch / reboot the Onn itself
REM ============================================================

setlocal enabledelayedexpansion

set "ADB=C:\platform-tools\platform-tools\adb.exe"
set "PROJ=%~dp0"
set "PROJ=%PROJ:~0,-1%"
set "IPFILE=%PROJ%\.onn-device"

REM ---------- Disconnect the Onn (remove reverse + adb session) ----------
set "ONN_IP="
if not "%~1"=="" set "ONN_IP=%~1"
if not defined ONN_IP if exist "%IPFILE%" set /p ONN_IP=<"%IPFILE%"

echo === Disconnecting Onn 4K ===
if defined ONN_IP (
  "%ADB%" -s %ONN_IP%:5555 reverse --remove-all >nul 2>&1
  "%ADB%" disconnect %ONN_IP%:5555 >nul 2>&1
  echo   disconnected %ONN_IP%:5555
) else (
  "%ADB%" disconnect >nul 2>&1
  echo   disconnected all network adb sessions
)

echo === Killing dev servers on :3000 / :8081 / :8082 ===
for %%P in (3000 8081 8082) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
    echo   port %%P -^> pid %%I
    taskkill /F /PID %%I 2>nul
  )
)

echo.
echo Stopped. Onn 4K untouched. Docker still running ^(use: docker compose down^).
endlocal
