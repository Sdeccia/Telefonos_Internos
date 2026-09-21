@echo off
title Respaldo de internos
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No se encontro Node.js en este equipo.
  echo.
  pause
  exit /b 1
)

node tools\respaldar.mjs
echo.
echo   Presiona una tecla para cerrar.
pause >nul
