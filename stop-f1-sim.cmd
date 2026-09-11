@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-f1-sim.ps1"
if errorlevel 1 (
  echo.
  echo F1 SIM could not be stopped. Review the message above.
  pause
)
endlocal
