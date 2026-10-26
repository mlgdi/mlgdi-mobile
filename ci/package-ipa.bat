@echo off
rem package-ipa.bat - double-click launcher for ci\package-ipa.ps1
rem Builds an unsigned IPA on GitHub Actions and downloads it to dist-ipa\.
rem Optional: pass a UNC share to also copy the IPA there, e.g.
rem   ci\package-ipa.bat "\\192.168.1.145\My Files"

setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%ci\package-ipa.ps1" %*
if errorlevel 1 (
  echo.
  echo FAILED. Scroll up for the error message.
)
echo.
pause
