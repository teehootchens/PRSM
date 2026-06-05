#!/bin/bash
# ============================================================
# OFFLINE INSTALL PREPARATION
# Run these commands on a machine with internet access:
#
#   pip3 download fastapi uvicorn clickhouse-connect \
#     python-multipart openpyxl bcrypt \
#     python-dotenv -d ./offline_packages
#
#   cd frontend && npm install && cd ..
#
# Then copy the entire PRSM directory including:
#   - offline_packages/
#   - frontend/node_modules/
# to the target server and run:
#   sudo bash setup.sh --offline
#
# To update an existing PRSM installation in-place:
#   sudo bash setup.sh --update
# ============================================================
set -e

# ── Color codes ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Configurable defaults ────────────────────────────────────────────────────
INSTALL_DIR="${INSTALL_DIR:-/opt/PRSM}"
SERVICE_USER="${SERVICE_USER:-prsm}"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 2>/dev/null || true)}"
RITA_DIR="${RITA_DIR:-/opt/rita}"
CLICKHOUSE_HOST="${CLICKHOUSE_HOST:-127.0.0.1}"
CLICKHOUSE_PORT="${CLICKHOUSE_PORT:-8123}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-default}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-}"
GUI_USERNAME="${GUI_USERNAME:-}"
GUI_PASSWORD="${GUI_PASSWORD:-}"

# Minimum versions
PYTHON_MIN="3.10"
NODE_MIN="18"
RITA_MIN="5.1"

# ── Flag parsing ─────────────────────────────────────────────────────────────
OFFLINE=false
FORCE=false
UNINSTALL=false
KEEP_DATA=false
UPDATE=false

for arg in "$@"; do
    case "$arg" in
        --offline)    OFFLINE=true ;;
        --force)      FORCE=true ;;
        --uninstall)  UNINSTALL=true ;;
        --keep-data)  KEEP_DATA=true ;;
        --update)     UPDATE=true ;;
        *)  echo -e "${RED}Unknown flag: $arg${RESET}"; echo "Usage: sudo bash setup.sh [--offline] [--force] [--uninstall] [--keep-data] [--update]"; exit 1 ;;
    esac
done

# ── Helper functions ─────────────────────────────────────────────────────────
section() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━  $1  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

ok()     { echo -e "  ${GREEN}✓${RESET} $*"; }
warn()   { echo -e "  ${YELLOW}⚠${RESET} $*"; PREFLIGHT_WARNINGS+=("$*"); }
fail()   { echo -e "  ${RED}✗${RESET} $*"; PREFLIGHT_ERRORS+=("$*"); }
autofix(){ echo -e "  ${CYAN}↻${RESET} ${BOLD}Auto-fix:${RESET} $*"; }
die()    { echo -e "\n${RED}${BOLD}FATAL: $*${RESET}\n"; exit 1; }

# Semantic version comparison: returns 0 if $1 >= $2
version_gte() {
    local IFS='.'
    local i
    # shellcheck disable=SC2206
    local ver1=($1) ver2=($2)
    for ((i=0; i<${#ver2[@]}; i++)); do
        local v1="${ver1[i]:-0}"
        local v2="${ver2[i]:-0}"
        if ((v1 > v2)); then return 0; fi
        if ((v1 < v2)); then return 1; fi
    done
    return 0
}

# Strip leading 'v' from version strings
strip_v() { echo "${1#v}"; }

# ── Uninstall ────────────────────────────────────────────────────────────────
if $UNINSTALL; then
    section "UNINSTALL PRSM"
    echo ""
    echo "The following will be removed:"
    echo "  • PRSM service (stopped and disabled)"
    echo "  • /etc/systemd/system/prsm.service"
    echo "  • /etc/nginx/sites-available/prsm"
    echo "  • /etc/nginx/ssl/prsm.crt and prsm.key"
    echo "  • limit_req_zone line from /etc/nginx/nginx.conf"
    echo "  • $SERVICE_USER system account"
    echo "  • /etc/sudoers.d/prsm-build"
    echo "  • $INSTALL_DIR"
    echo ""
    echo "The following will NOT be removed:"
    echo "  • nginx (may be used by other services)"
    echo "  • Python packages"
    echo "  • ufw rules"
    echo "  • RITA or ClickHouse"
    if $KEEP_DATA; then
        echo ""
        echo "  • .env and whitelist.db will be preserved at /tmp/prsm-backup/"
    fi
    echo ""
    read -r -p "Type 'uninstall' to proceed: " CONFIRM
    if [ "$CONFIRM" != "uninstall" ]; then
        echo "Aborted."
        exit 0
    fi

    echo ""
    set +e
    if systemctl is-active --quiet prsm 2>/dev/null; then
        systemctl stop prsm && ok "Stopped prsm service"
    fi
    if systemctl is-enabled --quiet prsm 2>/dev/null; then
        systemctl disable prsm && ok "Disabled prsm service"
    fi

    rm -f /etc/systemd/system/prsm.service
    systemctl daemon-reload
    ok "Removed prsm.service"

    if $KEEP_DATA; then
        mkdir -p /tmp/prsm-backup
        [ -f "$INSTALL_DIR/.env" ]        && cp "$INSTALL_DIR/.env"        /tmp/prsm-backup/ && ok "Preserved .env to /tmp/prsm-backup/"
        [ -f "$INSTALL_DIR/whitelist.db" ] && cp "$INSTALL_DIR/whitelist.db" /tmp/prsm-backup/ && ok "Preserved whitelist.db to /tmp/prsm-backup/"
    fi

    rm -rf "$INSTALL_DIR"
    ok "Removed $INSTALL_DIR"

    rm -f /etc/nginx/sites-available/prsm /etc/nginx/sites-enabled/prsm
    ok "Removed nginx site config"

    rm -f /etc/nginx/ssl/prsm.crt /etc/nginx/ssl/prsm.key
    ok "Removed SSL certificates"

    # Remove the limit_req_zone line we added
    if [ -f /etc/nginx/nginx.conf ] && grep -q "login_limit" /etc/nginx/nginx.conf; then
        sed -i '/login_limit/d' /etc/nginx/nginx.conf
        ok "Removed limit_req_zone from nginx.conf"
    fi

    if nginx -t 2>/dev/null; then
        systemctl reload nginx 2>/dev/null && ok "Reloaded nginx"
    fi

    if id "$SERVICE_USER" &>/dev/null; then
        userdel "$SERVICE_USER" && ok "Removed system account: $SERVICE_USER"
    fi

    rm -f /etc/sudoers.d/prsm-build
    ok "Removed sudoers entry"
    set -e

    echo ""
    echo -e "${GREEN}${BOLD}PRSM uninstalled successfully.${RESET}"
    if $KEEP_DATA; then
        echo -e "  Preserved files are at: ${BOLD}/tmp/prsm-backup/${RESET}"
    fi
    echo ""
    echo -e "${BOLD}To reinstall PRSM:${RESET}"
    echo "  sudo mkdir -p ${INSTALL_DIR}"
    echo "  sudo chown \$USER:\$USER ${INSTALL_DIR}"
    echo "  git clone https://github.com/teehootchens/PRSM.git ${INSTALL_DIR}"
    echo "  cd ${INSTALL_DIR} && sudo bash setup.sh"
    echo ""
    echo -e "${BOLD}To update an existing installation in the future:${RESET}"
    echo "  sudo bash ${INSTALL_DIR}/setup.sh --update"
    exit 0
fi

# ── Root check (early, before anything else) ─────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    die "This script must be run as root. Use: sudo bash setup.sh"
fi

# ── Update ────────────────────────────────────────────────────────────────────
if $UPDATE; then
    section "UPDATE PRSM"

    if [ ! -d "$INSTALL_DIR" ] || [ ! -f /etc/systemd/system/prsm.service ]; then
        echo -e "${RED}${BOLD}PRSM does not appear to be installed.${RESET}"
        echo ""
        echo "Expected:"
        echo "  Directory: $INSTALL_DIR"
        echo "  Service:   /etc/systemd/system/prsm.service"
        echo ""
        echo "To install PRSM for the first time, run:"
        echo "  sudo bash setup.sh"
        exit 1
    fi
    ok "PRSM installation found at $INSTALL_DIR"

    ok "Pulling latest code..."
    git -C "$INSTALL_DIR" pull
    NEW_COMMIT=$(git -C "$INSTALL_DIR" rev-parse --short HEAD)
    ok "Updated to commit: $NEW_COMMIT"

    ok "Updating Python packages..."
    pip3 install \
        fastapi uvicorn clickhouse-connect python-multipart \
        openpyxl "passlib[bcrypt]" python-dotenv bcrypt \
        --break-system-packages --quiet
    ok "Python packages up to date"

    ok "Building frontend..."
    cd "$INSTALL_DIR/frontend" && npm install --silent && npm run build
    cd "$INSTALL_DIR"
    ok "Frontend built"

    chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR/backend/static"
    ok "Static file ownership set to $SERVICE_USER"

    ok "Restarting prsm service..."
    systemctl restart prsm
    sleep 3

    if systemctl is-active --quiet prsm; then
        ok "prsm service is active"
    else
        echo ""
        echo -e "${RED}${BOLD}Service failed to start after update. Recent logs:${RESET}"
        journalctl -u prsm --no-pager -n 30 2>/dev/null || true
        die "prsm service did not start — check logs above"
    fi

    echo ""
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${RESET}"
    echo -e "${GREEN}${BOLD} PRSM UPDATE COMPLETE${RESET}"
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${RESET}"
    echo -e " Commit:   ${BOLD}${NEW_COMMIT}${RESET}"
    echo -e " Install:  ${BOLD}${INSTALL_DIR}${RESET}"
    echo -e " Service:  ${BOLD}prsm.service (active)${RESET}"
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${RESET}"
    echo ""
    exit 0
fi

# ── Section 1: Pre-flight checks ─────────────────────────────────────────────
section "1 — PRE-FLIGHT CHECKS"

# Tracking arrays for deferred error reporting
PREFLIGHT_ERRORS=()
PREFLIGHT_WARNINGS=()

# Disable exit-on-error during checks so we collect all failures
set +e

# ── Root ──
ok "Running as root"

# ── OS ──
if [ -f /etc/os-release ]; then
    . /etc/os-release
    os_pretty="${PRETTY_NAME:-$ID $VERSION_ID}"
    ok "OS: $os_pretty"
else
    warn "Cannot detect OS — script tested on Ubuntu 22.04 and Debian 12"
fi

# ── Python ──
if [ -z "$PYTHON_BIN" ]; then
    fail "Python 3 not found — install with: apt install python3"
else
    py_ver=$("$PYTHON_BIN" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.?[0-9]*' | head -1)
    if version_gte "$py_ver" "$PYTHON_MIN"; then
        ok "Python $py_ver"
    else
        fail "Python $py_ver is too old (minimum ${PYTHON_MIN}) — install with: apt install python3.10"
    fi
fi

# ── Node ──
node_bin=$(command -v node 2>/dev/null || true)
if [ -z "$node_bin" ]; then
    if $OFFLINE; then
        fail "Node.js not found — in offline mode, install manually: apt install nodejs (requires NodeSource repo for v${NODE_MIN}+)"
    else
        warn "Node.js not found — will be installed via NodeSource in Section 2"
    fi
else
    node_ver=$(node --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.?[0-9]*' | head -1)
    if version_gte "$node_ver" "$NODE_MIN.0.0"; then
        ok "Node $node_ver"
    else
        fail "Node $node_ver is too old (minimum ${NODE_MIN}) — update Node.js from NodeSource"
    fi
fi

# ── npm ── (bundled with NodeSource Node.js install — no separate check needed)

# ── nginx ──
if command -v nginx &>/dev/null; then
    ok "nginx installed"
elif $OFFLINE; then
    fail "nginx not installed — in offline mode, install manually: apt install nginx"
else
    warn "nginx not installed — will be installed in Section 2"
fi

# ── Docker ──
if ! command -v docker &>/dev/null; then
    fail "Docker not installed — install Docker first: https://docs.docker.com/engine/install/"
elif ! docker info &>/dev/null 2>&1; then
    fail "Docker daemon not running — start with: systemctl start docker"
else
    ok "Docker running"
fi

# ── RITA ──
if [ ! -d "$RITA_DIR" ]; then
    fail "RITA not found at $RITA_DIR — set RITA_DIR= to override"
else
    # Detect RITA version — try CLI first, then docker-compose.yml image tag, then docker inspect
    rita_ver=""
    if command -v rita &>/dev/null; then
        # Output format: "RITA version v5.1.2"
        rita_ver=$(rita --version 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.?[0-9]*' | grep -oE '[0-9]+\.[0-9]+\.?[0-9]*' | head -1 || true)
    fi
    if [ -z "$rita_ver" ] && [ -f "$RITA_DIR/docker-compose.yml" ]; then
        rita_ver=$(grep -Ei "image:.*rita" "$RITA_DIR/docker-compose.yml" 2>/dev/null \
            | grep -oE '[0-9]+\.[0-9]+\.?[0-9]*' | head -1 || true)
    fi
    if [ -z "$rita_ver" ]; then
        # Try docker inspect on running rita container
        rita_ver=$(docker inspect "$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i rita | head -1)" 2>/dev/null \
            | grep -oE 'rita:v?[0-9]+\.[0-9]+\.?[0-9]*' | grep -oE '[0-9]+\.[0-9]+\.?[0-9]*' | head -1 || true)
    fi

    if [ -z "$rita_ver" ]; then
        warn "Could not detect RITA version — ensure RITA ${RITA_MIN}+ is installed"
    elif version_gte "$rita_ver" "$RITA_MIN"; then
        ok "RITA v${rita_ver} found at $RITA_DIR"
    else
        fail "RITA v${rita_ver} is too old (minimum v${RITA_MIN}) — update RITA"
    fi
fi

# ── ClickHouse ──
ch_ok=false
ch_needs_port_fix=false
for i in 1 2 3; do
    if curl -sf --max-time 3 "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/ping" 2>/dev/null | grep -q "Ok"; then
        ch_ok=true
        break
    fi
    [ $i -lt 3 ] && sleep 2
done

if ! $ch_ok; then
    # Check if ClickHouse is running in Docker but not port-bound to localhost
    if docker ps 2>/dev/null | grep -qi clickhouse; then
        ch_needs_port_fix=true
        autofix "ClickHouse container is running but not bound to ${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}"
        autofix "Editing $RITA_DIR/docker-compose.yml and restarting ClickHouse..."
        if [ -f "$RITA_DIR/docker-compose.yml" ]; then
            # Add port binding using Python (avoids YAML parsing fragility with sed)
            COMPOSE_FILE="$RITA_DIR/docker-compose.yml" python3 - << 'PYEOF'
import os, re

path = os.environ['COMPOSE_FILE']
with open(path) as f:
    content = f.read()

# Only consider the port bound if it appears on an uncommented line
# Detect both short-form (8123:8123) and long-form (published: 8123)
active = any(
    '8123:8123' in line or bool(re.search(r'published:\s*["\']?8123["\']?', line))
    for line in content.splitlines()
    if not line.lstrip().startswith('#')
)
if active:
    print("already_bound")
    exit(0)

LONG_FORM = (
    '    ports:\n'
    '      - target: 8123\n'
    '        host_ip: "127.0.0.1"\n'
    '        published: 8123\n'
    '        protocol: tcp'
)

# Replace a commented-out ports block (# ports: header + commented entries)
# Handles RITA v5 format where the entire ports section is commented out
new_content = re.sub(
    r'[ \t]*# ports:\n(?:[ \t]*#[^\n]*\n)*',
    LONG_FORM + '\n',
    content
)
if new_content != content:
    with open(path, 'w') as f:
        f.write(new_content)
    print("port_uncommented")
    exit(0)

# No commented ports block — append long-form ports section after clickhouse: service line
new_content = re.sub(
    r'(  clickhouse:\n)',
    lambda m: m.group(1) + LONG_FORM + '\n',
    content
)
if new_content != content:
    with open(path, 'w') as f:
        f.write(new_content)
    print("ports_section_added")
    exit(0)

print("manual_edit_needed")
PYEOF
            cd "$RITA_DIR" && docker compose down clickhouse && docker compose up -d clickhouse
            # Wait up to 30s for ClickHouse to be ready
            for i in $(seq 1 15); do
                sleep 2
                if curl -sf --max-time 3 "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/ping" 2>/dev/null | grep -q "Ok"; then
                    ch_ok=true
                    ok "ClickHouse reachable at ${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT} (after port fix)"
                    break
                fi
            done
        fi
    fi

    if ! $ch_ok; then
        # Check if Docker containers are down entirely
        if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
            autofix "Docker containers may be down — attempting: cd $RITA_DIR && docker compose up -d"
            if [ -f "$RITA_DIR/docker-compose.yml" ]; then
                cd "$RITA_DIR" && docker compose up -d
                for i in $(seq 1 15); do
                    sleep 2
                    if curl -sf --max-time 3 "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/ping" 2>/dev/null | grep -q "Ok"; then
                        ch_ok=true
                        ok "ClickHouse reachable at ${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT} (after docker compose up)"
                        break
                    fi
                done
            fi
        fi
    fi

    if ! $ch_ok; then
        fail "ClickHouse unreachable at ${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT} — ensure the container is running: cd $RITA_DIR && docker compose up -d clickhouse"
    fi
else
    ok "ClickHouse reachable at ${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}"
fi

# ── ClickHouse datasets ──
if $ch_ok; then
    ch_datasets=$(curl -sf --max-time 5 \
        -u "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" \
        "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/?query=SHOW+DATABASES" 2>/dev/null \
        | grep -vE "^(INFORMATION_SCHEMA|information_schema|system|default|_temporary_and_external_tables)$" \
        | grep -c '.' 2>/dev/null || echo "0")
    if [ "$ch_datasets" -gt 0 ] 2>/dev/null; then
        ok "ClickHouse: $ch_datasets dataset(s) found"
    else
        warn "No datasets found in ClickHouse — RITA may not have processed data yet"
    fi
fi

# ── PRSM repo integrity ──
if [ ! -f "$INSTALL_DIR/backend/main.py" ] || [ ! -f "$INSTALL_DIR/frontend/package.json" ]; then
    fail "PRSM repo incomplete (missing backend/main.py or frontend/package.json) — clone the full PRSM repo first"
else
    ok "PRSM repo complete"
fi

# ── Disk space ──
if df "$INSTALL_DIR" &>/dev/null 2>&1; then
    free_kb=$(df "$INSTALL_DIR" 2>/dev/null | awk 'NR==2{print $4}')
    free_gb=$((free_kb / 1024 / 1024))
    if [ "$free_gb" -lt 1 ]; then
        fail "Disk space critically low: ${free_gb}GB free (minimum 1GB required)"
    elif [ "$free_gb" -lt 2 ]; then
        warn "Disk space low: ${free_gb}GB free — installation may succeed but monitor usage"
    else
        ok "Disk space: ${free_gb}GB free"
    fi
else
    warn "Could not check disk space"
fi

# ── Offline-specific checks ──
if $OFFLINE; then
    offline_missing=()
    for spec in "fastapi:fastapi" "uvicorn:uvicorn" "clickhouse_connect:clickhouse-connect" \
                "bcrypt:bcrypt" "dotenv:python-dotenv" "multipart:python-multipart" "openpyxl:openpyxl"; do
        imp="${spec%%:*}"
        pkg="${spec##*:}"
        if ! "$PYTHON_BIN" -c "import $imp" 2>/dev/null; then
            offline_missing+=("$pkg")
            fail "Python package missing (offline mode): $pkg"
        fi
    done

    if [ ${#offline_missing[@]} -gt 0 ]; then
        echo ""
        echo -e "  ${YELLOW}To install missing packages offline:${RESET}"
        echo -e "  ${YELLOW}  pip3 install --no-index --find-links=./offline_packages ${offline_missing[*]} --break-system-packages${RESET}"
    fi

    if [ ! -d "$INSTALL_DIR/frontend/node_modules" ]; then
        fail "frontend/node_modules missing (offline mode) — prepare bundle: cd frontend && npm install on an internet-connected machine, then copy the full directory"
    else
        ok "frontend/node_modules present (offline)"
    fi
fi

# ── Port conflicts ──
ports_80=$(ss -tlnp 2>/dev/null | grep ':80 ' | grep -v nginx || true)
ports_443=$(ss -tlnp 2>/dev/null | grep ':443 ' | grep -v nginx || true)
if [ -n "$ports_80" ] || [ -n "$ports_443" ]; then
    warn "Port 80/443 in use by a non-nginx process — nginx may fail to start"
fi

# ── Optional tools ──
if ! command -v git &>/dev/null; then
    warn "git not installed — recommended for future updates: apt install git"
fi
if ! command -v ufw &>/dev/null; then
    warn "ufw not available — firewall will not be configured (set up manually after install)"
fi

# Re-enable exit-on-error
set -e

# ── Pre-flight summary ──
echo ""
echo -e "${BOLD}PRE-FLIGHT SUMMARY${RESET}"
printf '  %-50s %s\n' "Running as root"                "$(echo -e "${GREEN}✓${RESET}")"
[ -n "${os_pretty:-}" ] && printf '  %-50s %s\n' "$os_pretty"       "$(echo -e "${GREEN}✓${RESET}")" || true
[ -n "${py_ver:-}" ]    && printf '  %-50s %s\n' "Python $py_ver"   "$(echo -e "${GREEN}✓${RESET}")" || true
[ -n "${node_ver:-}" ]  && printf '  %-50s %s\n' "Node $node_ver"                        "$(echo -e "${GREEN}✓${RESET}")" || true
[ -n "${rita_ver:-}" ]  && printf '  %-50s %s\n' "RITA v${rita_ver} at ${RITA_DIR}"    "$(echo -e "${GREEN}✓${RESET}")" || true
$ch_ok && printf '  %-50s %s\n' "ClickHouse ${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}"     "$(echo -e "${GREEN}✓${RESET}")" || true
for w in "${PREFLIGHT_WARNINGS[@]}"; do
    printf '  %-50s %s\n' "$w" "$(echo -e "${YELLOW}⚠${RESET}")"
done

if [ ${#PREFLIGHT_ERRORS[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}${BOLD}Pre-flight failed — fix the following before re-running:${RESET}"
    for e in "${PREFLIGHT_ERRORS[@]}"; do
        echo -e "  ${RED}✗${RESET} $e"
    done
    exit 1
fi
echo ""
echo -e "  ${GREEN}${BOLD}All pre-flight checks passed.${RESET}"

# ── Interactive prompts (if not already set) ─────────────────────────────────
section "CONFIGURATION"

if [ -z "$GUI_USERNAME" ]; then
    read -r -p "  GUI username [admin]: " GUI_USERNAME
    GUI_USERNAME="${GUI_USERNAME:-admin}"
fi
ok "Username: $GUI_USERNAME"

if [ -z "$GUI_PASSWORD" ]; then
    while true; do
        read -r -s -p "  GUI password (max 72 characters): " GUI_PASSWORD
        echo ""
        if [ "${#GUI_PASSWORD}" -gt 72 ]; then
            echo -e "  ${RED}Password exceeds the 72-character bcrypt limit — try again.${RESET}"
            GUI_PASSWORD=""
            continue
        fi
        read -r -s -p "  Confirm password: " GUI_PASSWORD2
        echo ""
        if [ "$GUI_PASSWORD" = "$GUI_PASSWORD2" ] && [ -n "$GUI_PASSWORD" ]; then
            break
        fi
        echo -e "  ${RED}Passwords do not match or are empty — try again.${RESET}"
    done
fi
ok "Password set (bcrypt hash will be generated)"

# ── Section 2: Dependency install ────────────────────────────────────────────
section "2 — DEPENDENCIES"

if $OFFLINE; then
    ok "Offline mode — skipping package downloads"
    ok "Using pre-installed Python packages and frontend/node_modules"
else
    ok "Installing system packages..."
    apt-get update -qq
    apt-get install -y -qq nginx openssl curl python3-pip
    ok "System packages installed"

    ok "Installing Node.js LTS from NodeSource..."
    NODE_LTS=$(curl -fsSL https://resolve.installnode.com/lts 2>/dev/null || echo "22")
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_LTS}.x" | bash - 2>/dev/null
    apt-get install -y -qq nodejs
    ok "Node.js ${NODE_LTS}.x LTS installed"

    ok "Installing Python packages..."
    pip3 install \
        fastapi uvicorn clickhouse-connect python-multipart \
        openpyxl bcrypt python-dotenv \
        --break-system-packages --quiet
    ok "Python packages installed"

    ok "Installing frontend npm packages..."
    cd "$INSTALL_DIR/frontend" && npm install --silent
    cd "$INSTALL_DIR"
    ok "Frontend dependencies installed"
fi

# ── Section 3: Service account ───────────────────────────────────────────────
section "3 — SERVICE ACCOUNT"

if id "$SERVICE_USER" &>/dev/null; then
    ok "System account '$SERVICE_USER' already exists"
else
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
    ok "Created system account: $SERVICE_USER"
fi

# ── Section 4: Environment configuration ─────────────────────────────────────
section "4 — ENVIRONMENT CONFIGURATION"

if [ -f "$INSTALL_DIR/.env" ] && ! $FORCE; then
    warn ".env already exists — skipping (use --force to overwrite)"
    echo "  Current .env keys (values hidden):"
    grep -oE '^[A-Z_]+' "$INSTALL_DIR/.env" | while read -r key; do
        echo "    $key=***"
    done
else
    ok "Generating TOKEN_SECRET..."
    TOKEN_SECRET=$("$PYTHON_BIN" -c "import secrets; print(secrets.token_hex(32))")

    ok "Hashing GUI password with bcrypt..."
    GUI_PASSWORD_HASH=$(GUI_PASSWORD="${GUI_PASSWORD}" "$PYTHON_BIN" -c \
        "import bcrypt, os; pw = os.environ['GUI_PASSWORD'].encode(); print(bcrypt.hashpw(pw, bcrypt.gensalt(rounds=12)).decode())")

    cat > "$INSTALL_DIR/.env" << ENV_EOF
# Generated by setup.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
CLICKHOUSE_HOST=${CLICKHOUSE_HOST}
CLICKHOUSE_PORT=${CLICKHOUSE_PORT}
CLICKHOUSE_USER=${CLICKHOUSE_USER}
CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD}
GUI_USERNAME=${GUI_USERNAME}
GUI_PASSWORD_HASH=${GUI_PASSWORD_HASH}
TOKEN_SECRET=${TOKEN_SECRET}
ENV_EOF

    chmod 640 "$INSTALL_DIR/.env"
    chown "${SERVICE_USER}" "$INSTALL_DIR/.env"
    ok ".env written and secured (mode 640, owner $SERVICE_USER)"

    # Clear password from memory (best-effort in bash)
    GUI_PASSWORD=""
    GUI_PASSWORD_HASH=""
    TOKEN_SECRET=""
fi

# ── Section 5: Suppression database ──────────────────────────────────────────
section "5 — SUPPRESSION DATABASE"

if [ -f "$INSTALL_DIR/whitelist.db" ]; then
    ok "whitelist.db already exists — skipping"
else
    DB_PATH="$INSTALL_DIR/whitelist.db" "$PYTHON_BIN" - << 'PYEOF'
import sqlite3, os
path = os.environ['DB_PATH']
conn = sqlite3.connect(path)
conn.executescript("""
CREATE TABLE IF NOT EXISTS suppressions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    value       TEXT NOT NULL,
    value_type  TEXT NOT NULL,
    scope       TEXT NOT NULL,
    reason      TEXT,
    expires_at  TIMESTAMP,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by  TEXT DEFAULT 'admin'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppression ON suppressions(value, value_type, scope);
""")
conn.commit()
conn.close()
PYEOF
    chown "${SERVICE_USER}" "$INSTALL_DIR/whitelist.db"
    chmod 664 "$INSTALL_DIR/whitelist.db"
    ok "whitelist.db created with schema"
fi

# ── Section 6: Frontend build ─────────────────────────────────────────────────
section "6 — FRONTEND BUILD"

cd "$INSTALL_DIR/frontend"
npm run build
cd "$INSTALL_DIR"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR/backend/static"
ok "Frontend built and static files owned by $SERVICE_USER"

# ── Section 7: SSL certificate ────────────────────────────────────────────────
section "7 — SSL CERTIFICATE"

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$SERVER_IP" ] && SERVER_IP="127.0.0.1"
ok "Detected server IP: $SERVER_IP"

mkdir -p /etc/nginx/ssl

if [ -f /etc/nginx/ssl/prsm.crt ] && ! $FORCE; then
    ok "SSL certificate already exists — skipping (use --force to regenerate)"
else
    openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/prsm.key \
        -out    /etc/nginx/ssl/prsm.crt \
        -subj   "/C=US/ST=Local/L=Local/O=PRSM/CN=prsm.local" \
        -addext "subjectAltName=IP:${SERVER_IP}" \
        2>/dev/null
    chmod 600 /etc/nginx/ssl/prsm.key
    ok "Self-signed certificate generated for IP $SERVER_IP (valid 825 days)"
fi

# ── Section 8: Nginx configuration ───────────────────────────────────────────
section "8 — NGINX CONFIGURATION"

# Add rate-limit zone only if not already present
if grep -q "login_limit" /etc/nginx/nginx.conf; then
    ok "login_limit zone already in nginx.conf — skipping"
else
    sed -i '/http {/a\    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;' \
        /etc/nginx/nginx.conf
    ok "Added login_limit rate-limit zone to nginx.conf"
fi

# Write the PRSM nginx site config (nginx vars use \$ to avoid bash expansion)
cat > /etc/nginx/sites-available/prsm << 'NGINX_EOF'
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name _;

    ssl_certificate     /etc/nginx/ssl/prsm.crt;
    ssl_certificate_key /etc/nginx/ssl/prsm.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;

    location /api/login {
        limit_req zone=login_limit burst=3 nodelay;
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_EOF
ok "Wrote /etc/nginx/sites-available/prsm"

ln -sf /etc/nginx/sites-available/prsm /etc/nginx/sites-enabled/prsm
ok "Enabled prsm nginx site"

# Disable the default site if present
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm -f /etc/nginx/sites-enabled/default
    autofix "Disabled nginx default site"
fi

# Validate and reload nginx
if ! nginx -t 2>&1; then
    echo ""
    die "nginx configuration test failed — see errors above"
fi
ok "nginx config valid"
systemctl enable nginx --quiet 2>/dev/null || true
systemctl reload nginx
ok "nginx reloaded"

# ── Section 9: Systemd service ────────────────────────────────────────────────
section "9 — SYSTEMD SERVICE"

cat > /etc/systemd/system/prsm.service << SERVICE_EOF
[Unit]
Description=PRSM - Pattern Recognition and Scoring Matrix
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
Environment=PYTHONPATH=${INSTALL_DIR}
ExecStart=${PYTHON_BIN} -m uvicorn backend.main:app --host 127.0.0.1 --port 8080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE_EOF

ok "Wrote /etc/systemd/system/prsm.service"
systemctl daemon-reload
systemctl enable prsm --quiet
systemctl start prsm
ok "prsm service enabled and started"

# Wait up to 15s for the service to be active
ok "Waiting for service to become active..."
for i in $(seq 1 5); do
    sleep 3
    if systemctl is-active --quiet prsm; then
        ok "prsm service is active"
        break
    fi
    if [ $i -eq 5 ]; then
        echo ""
        echo -e "${RED}${BOLD}Service failed to start. Recent logs:${RESET}"
        journalctl -u prsm --no-pager -n 30 2>/dev/null || true
        die "prsm service did not start — check logs above"
    fi
done

# ── Section 10: Firewall ──────────────────────────────────────────────────────
section "10 — FIREWALL"

if command -v ufw &>/dev/null; then
    ufw allow 22/tcp   > /dev/null 2>&1
    ufw allow 80/tcp   > /dev/null 2>&1
    ufw allow 443/tcp  > /dev/null 2>&1
    ufw default deny incoming  > /dev/null 2>&1
    ufw default allow outgoing > /dev/null 2>&1
    ufw --force enable > /dev/null 2>&1
    ok "ufw configured (22, 80, 443 open; incoming default deny)"
else
    warn "ufw not available — firewall not configured. Recommend manual setup after install."
fi

# ── Section 11: Sudoers for build script ──────────────────────────────────────
section "11 — SUDOERS / BUILD PERMISSIONS"

if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
    SUDOERS_FILE="/etc/sudoers.d/prsm-build"
    cat > "$SUDOERS_FILE" << SUDOERS_EOF
# PRSM build script permissions for ${SUDO_USER}
${SUDO_USER} ALL=(ALL) NOPASSWD: /usr/bin/chown -R ${SERVICE_USER}\:${SERVICE_USER} ${INSTALL_DIR}/backend/static
${SUDO_USER} ALL=(ALL) NOPASSWD: /bin/systemctl restart prsm
SUDOERS_EOF
    chmod 440 "$SUDOERS_FILE"
    # Validate sudoers file
    if visudo -c -f "$SUDOERS_FILE" > /dev/null 2>&1; then
        ok "Sudoers entry written for $SUDO_USER at $SUDOERS_FILE"
    else
        rm -f "$SUDOERS_FILE"
        warn "Sudoers file failed validation — skipped. Add permissions manually."
    fi
else
    warn "SUDO_USER not set or is root — skipping sudoers entry. Run the script via sudo from your dev account to configure this automatically."
fi

# ── Section 12: Final verification ────────────────────────────────────────────
section "12 — FINAL VERIFICATION"

echo ""
ok "Listening ports:"
ss -tlnp 2>/dev/null | grep -E "8080|443|:80 " | while read -r line; do
    echo "    $line"
done || true

svc_status=$(systemctl is-active prsm 2>/dev/null || true)
if [ "$svc_status" = "active" ]; then
    ok "prsm service: active"
else
    fail "prsm service: $svc_status"
fi

# Health check
sleep 2
http_code=$(curl -sk https://127.0.0.1/health -o /dev/null -w "%{http_code}" 2>/dev/null || true)
if [ "$http_code" = "200" ]; then
    ok "Health check: HTTP $http_code /health"
else
    warn "Health check returned HTTP $http_code — service may still be starting"
fi

# ── Success banner ────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD} PRSM INSTALLATION COMPLETE${RESET}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${RESET}"
echo -e " URL:      ${BOLD}https://${SERVER_IP}${RESET}"
echo -e " Username: ${BOLD}${GUI_USERNAME}${RESET}"
echo -e " Install:  ${BOLD}${INSTALL_DIR}${RESET}"
echo -e " Service:  ${BOLD}prsm.service${RESET}"
echo ""
echo -e " ${YELLOW}⚠  You will see a browser certificate warning${RESET}"
echo -e " ${YELLOW}   — this is expected for a self-signed cert.${RESET}"
echo -e " ${YELLOW}   Accept it to proceed.${RESET}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${RESET}"
echo ""
