@echo off
title Internos Telefonicos
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No se encontro Node.js en este equipo.
  echo   Instalalo desde https://nodejs.org  y volve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

if not exist "data\telefonos.json" (
  echo Generando la base de datos desde extensions.csv...
  node tools\seed.mjs
)

echo.
echo   Abriendo el sistema de internos en el navegador...
start "" http://localhost:5173
node server.mjs

echo.
echo   El servidor se detuvo.
pause
