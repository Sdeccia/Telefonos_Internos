#!/bin/sh
set -eu

PROYECTO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PROYECTO_DIR"

if [ ! -f .env ]; then
  echo "Falta .env. Copia .env.example a .env y define ADMIN_PASSWORD."
  exit 1
fi

set -a
. ./.env
set +a

if [ -z "${ADMIN_PASSWORD:-}" ] || [ "$ADMIN_PASSWORD" = "cambiar-por-una-clave-larga" ]; then
  echo "ADMIN_PASSWORD no esta configurada con una clave real."
  exit 1
fi

if [ -f servidor.pid ] && kill -0 "$(cat servidor.pid)" 2>/dev/null; then
  echo "El servidor ya esta iniciado (PID $(cat servidor.pid))."
  exit 0
fi

nohup node server.mjs > servidor.log 2>&1 &
echo $! > servidor.pid
echo "Servidor iniciado (PID $(cat servidor.pid))."