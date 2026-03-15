#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# BYFLOW — Monitor de Seguridad para Termux
# Ejecuta desde tu celular para vigilar el servidor en tiempo real
# powered by IArtLabs
# ═══════════════════════════════════════════════════════════════════

# ── Configuracion ──────────────────────────────────────────────────
# Cambia estos valores por los tuyos:
SERVER_URL="${BYFLOW_URL:-https://byflowapp.up.railway.app}"
ADMIN_KEY="${BYFLOW_ADMIN:-BF-ArT-2026-IArtLabs}"
REFRESH=30  # segundos entre checks
# ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

clear
echo -e "${CYAN}${BOLD}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║  BYFLOW SECURITY MONITOR v1.0         ║"
echo "  ║  powered by IArtLabs                  ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  Servidor: ${CYAN}${SERVER_URL}${NC}"
echo -e "  Refresh:  cada ${REFRESH}s"
echo -e "  Ctrl+C para salir"
echo ""

# Verificar que curl esta instalado
if ! command -v curl &> /dev/null; then
  echo -e "${RED}[!] curl no encontrado. Instala con: pkg install curl${NC}"
  exit 1
fi

# Verificar que jq esta instalado (opcional pero recomendado)
HAS_JQ=false
if command -v jq &> /dev/null; then
  HAS_JQ=true
fi

check_health() {
  local resp
  resp=$(curl -s --connect-timeout 5 --max-time 10 "${SERVER_URL}/api/health" 2>/dev/null)
  if [ $? -ne 0 ] || [ -z "$resp" ]; then
    echo -e "  ${RED}[OFFLINE] Servidor no responde${NC}"
    return 1
  fi

  if $HAS_JQ; then
    local status uptime songs queue shield blocked
    status=$(echo "$resp" | jq -r '.status // "?"')
    uptime=$(echo "$resp" | jq -r '.uptime // 0' | awk '{printf "%.0f", $1/3600}')
    songs=$(echo "$resp" | jq -r '.songs // 0')
    queue=$(echo "$resp" | jq -r '.queue // 0')
    shield=$(echo "$resp" | jq -r '.shield // false')
    blocked=$(echo "$resp" | jq -r '.blocked_total // 0')

    echo -e "  ${GREEN}[ONLINE]${NC} Status: ${status} | Uptime: ${uptime}h"
    echo -e "  Canciones: ${songs} | Cola: ${queue}"
    if [ "$shield" = "true" ]; then
      echo -e "  Shield: ${GREEN}ACTIVO${NC} | Bloqueados: ${YELLOW}${blocked}${NC}"
    else
      echo -e "  Shield: ${RED}INACTIVO${NC}"
    fi
  else
    echo -e "  ${GREEN}[ONLINE]${NC} ${resp}"
  fi
}

check_security() {
  local resp
  resp=$(curl -s --connect-timeout 5 --max-time 10 \
    -H "x-admin-key: ${ADMIN_KEY}" \
    "${SERVER_URL}/api/security/log?limit=10" 2>/dev/null)

  if [ $? -ne 0 ] || [ -z "$resp" ]; then
    echo -e "  ${RED}[!] No se pudo obtener log de seguridad${NC}"
    return 1
  fi

  if $HAS_JQ; then
    local total
    total=$(echo "$resp" | jq -r '.total_blocked // 0')

    echo -e "\n  ${BOLD}--- Seguridad ---${NC}"
    echo -e "  Total bloqueados: ${YELLOW}${total}${NC}"

    # Tipos de ataque
    echo -e "  ${BOLD}Por tipo:${NC}"
    echo "$resp" | jq -r '.by_type // {} | to_entries[] | "    \(.key): \(.value)"' 2>/dev/null

    # Ultimos eventos
    local count
    count=$(echo "$resp" | jq '.recent | length' 2>/dev/null)
    if [ "$count" != "0" ] && [ "$count" != "null" ]; then
      echo -e "\n  ${BOLD}Ultimos eventos:${NC}"
      echo "$resp" | jq -r '.recent[:5][] | "    [\(.time | split("T")[1] | split(".")[0])] \(.type) <- \(.ip) : \(.detail[:60])"' 2>/dev/null
    else
      echo -e "  ${GREEN}Sin ataques recientes${NC}"
    fi
  else
    echo -e "\n  ${BOLD}Log seguridad:${NC} ${resp}"
    echo -e "  ${YELLOW}Tip: instala jq para ver mejor: pkg install jq${NC}"
  fi
}

check_stats() {
  local resp
  resp=$(curl -s --connect-timeout 5 --max-time 10 \
    "${SERVER_URL}/api/stats" 2>/dev/null)

  if [ $? -ne 0 ] || [ -z "$resp" ]; then
    return 1
  fi

  if $HAS_JQ; then
    local tsongs tsingers
    tsongs=$(echo "$resp" | jq -r '.totalSongs // 0')
    tsingers=$(echo "$resp" | jq -r '.totalSingers // 0')

    echo -e "\n  ${BOLD}--- Estadisticas ---${NC}"
    echo -e "  Canciones reproducidas: ${tsongs}"
    echo -e "  Cantantes registrados:  ${tsingers}"

    echo -e "  ${BOLD}Top 3 canciones:${NC}"
    echo "$resp" | jq -r '.topSongs[:3][] | "    \(.name): \(.count) plays"' 2>/dev/null

    echo -e "  ${BOLD}Top 3 cantantes:${NC}"
    echo "$resp" | jq -r '.topSingers[:3][] | "    \(.name): \(.count) veces"' 2>/dev/null
  fi
}

# ── Loop principal ─────────────────────────────────────────────────
while true; do
  echo -e "\n${CYAN}━━━ $(date '+%Y-%m-%d %H:%M:%S') ━━━${NC}"
  check_health
  check_security
  check_stats
  echo -e "\n${CYAN}  Siguiente check en ${REFRESH}s...${NC}"
  sleep $REFRESH
done
