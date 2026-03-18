#!/bin/bash
# Colmena Watchdog — relanza auto-runner infinitamente
# Uso: nohup bash watchdog.sh &

cd /c/BYFLOW/Colmena

while true; do
  echo "$(date) — Lanzando auto-runner TURBO..."
  node auto-runner.js --rounds 10 --interval 2 --gpu-first --tasks 5 >> auto-runner-turbo.log 2>&1
  EXIT_CODE=$?
  echo "$(date) — Auto-runner terminó (exit: $EXIT_CODE). Relanzando en 10s..." >> auto-runner-turbo.log
  sleep 10
done
