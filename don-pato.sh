#!/bin/bash
# ByFlow — Script rapido para Don Pato
# Ejecutar: bash don-pato.sh

clear
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   ByFlow — Modo Bar (Don Pato)       ║"
echo "  ║   Vive Cantando · powered by IArtLabs║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Check Node
if ! command -v node &> /dev/null; then
  echo "  [ERROR] Node.js no encontrado. Instala Node 18+"
  exit 1
fi

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "  [*] Instalando dependencias..."
  npm install --omit=dev
fi

# Get local IP
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$IP" ]; then
  IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
fi
PORT=${PORT:-8080}

echo "  [*] Iniciando servidor..."
echo ""
echo "  ┌──────────────────────────────────────────────┐"
echo "  │  Panel DJ:    http://$IP:$PORT             │"
echo "  │  TV Display:  http://$IP:$PORT/display.html│"
echo "  │  QR Patron:   http://$IP:$PORT/remote.html │"
echo "  └──────────────────────────────────────────────┘"
echo ""
echo "  [!] Instrucciones:"
echo "    1. Conecta TV por HDMI → abre display.html"
echo "    2. Los clientes escanean el QR en la TV"
echo "    3. Tu operas desde el Panel DJ en tu laptop"
echo ""
echo "  Ctrl+C para detener"
echo "  ────────────────────────────────────────────────"
echo ""

node server.js
