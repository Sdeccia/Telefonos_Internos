#!/bin/sh
set -eu

PROYECTO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PROYECTO_DIR"

if [ -f servidor.pid ]; then
  PID=$(cat servidor.pid)
  kill "$PID" 2>/dev/null || true
  rm -f servidor.pid
  echo "Servidor detenido."
else
  echo "No se encontro servidor.pid."
fi