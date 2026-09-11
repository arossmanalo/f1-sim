@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-f1-sim.ps1"
if errorlevel 1 (
  echo.
  echo F1 SIM could not start. Review the message above.
  pause
)
endlocal
