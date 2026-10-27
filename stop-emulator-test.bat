@echo off
REM ============================================================
REM RestoSync — Stop emulator test environment
REM  - Kills both emulators
REM  - Closes Metro / Expo / API dev server node processes
REM  - Leaves Docker containers running (use `docker compose down` to stop those)
REM ============================================================

setlocal

set "ADB=C:\platform-tools\platform-tools\adb.exe"

echo === Stopping emulators ===
"%ADB%" -s emulator-5554 emu kill 2>nul
"%ADB%" -s emulator-5556 emu kill 2>nul
timeout /t 2 /nobreak >nul

echo === Killing dev servers on :3000 / :8081 / :8082 ===
for %%P in (3000 8081 8082) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
    echo   port %%P -^> pid %%I
    taskkill /F /PID %%I 2>nul
  )
)

echo === adb kill-server ===
"%ADB%" kill-server

echo.
echo Stopped. Docker containers still running ^(use: docker compose down^).
endlocal
