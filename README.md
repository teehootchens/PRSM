# RITA GUI

A web-based GUI for [RITA v5](https://github.com/activecm/rita) (Real Intelligence Threat Analytics) built as a self-hosted alternative to AC-Hunter.

## Features

### Analysis Pages
- **Dashboard** — summary counts, top threats, detection trend chart, score distribution chart
- **Beaconing** — scored connections sorted by threat score with expandable history
- **Long Connections** — persistent outbound sessions by duration
- **DNS Analysis** — C2-over-DNS and DNS tunneling detection
- **Threat Intel** — connections matching known bad IPs/domains from threat feeds
- **Strobe Detection** — high connection count hosts

### Filtering & Investigation
- Global IP/FQDN/CIDR filter that persists across all pages and browser refreshes
- CIDR notation support (10.0.0.0/24) and wildcard (10.0.0.*) in filter box
- Click any src/dst/FQDN to instantly filter — text selection safe
- Time range filter: Last 24h, 7d, 30d, 90d, 1yr, All Time, or custom date range
- Drag-to-zoom on trend chart with Apply as filter button
- Minimum score threshold slider
- Beacon type filter (IP / DNS)
- Protocol/port filter (populated from actual dataset values)
- TI Only toggle — show only threat intel hits across all pages
- Active filters badge in sidebar — always visible, clear individually or all at once

### Suppression List
- Right-click any row on any page to suppress src IP, dst IP, or FQDN
- Suppression scopes: Global (all datasets) or per-dataset
- Expiry options: 30, 60, 90, 180 days, 1 year, or Permanent
- Optional reason/note per suppression
- CIDR suppression (8.8.8.0/24 suppresses entire range)
- Show/hide suppressed entries toggle with visual red highlight
- Suppression List management page with:
  - Manual add with type, scope, expiry, and reason
  - Excel import (single column, no header — IPs, CIDRs, or FQDNs)
  - Multi-select bulk delete with typed confirmation (type delete)
  - Grouped display — same IP shown as one row with multiple type badges
  - Individual type removal via badge X button

### Dashboard
- Clickable stat cards navigate to respective analysis pages
- TI + Beacon card activates TI Only filter and navigates to Beaconing
- Top tables support right-click suppress and click-to-filter
- Detection trend chart with toggleable series (Beaconing, Threat Intel, Long Conns, C2/DNS, Strobe)
- Score distribution horizontal bar chart
- Dataset coverage date range display

### Detail Panel
- Click any row to open a slide-out detail panel
- Shows all scores with visual progress bars
- Beacon interval histogram
- Data size distribution chart
- Full connection metadata

### Auth & Security
- Login page with bcrypt hashed password
- Session persists across page refreshes (sessionStorage)
- HTTP Basic auth — no browser popup on failed login
- Single username/password configured via .env

## Stack

- **Backend** — Python 3, FastAPI, clickhouse-connect
- **Frontend** — React 18, Vite, TanStack Table, Chart.js
- **Database** — ClickHouse (via RITA v5 Docker deployment)
- **Suppression store** — SQLite (/opt/rita-gui/whitelist.db)
- **Deployment** — systemd service on port 8080

## Requirements

- RITA v5.1+ running via Docker Compose
- Python 3.10+
- Node.js 22+
- ClickHouse HTTP port 8123 exposed to localhost

## Setup

### 1. Expose ClickHouse HTTP port to localhost

Edit /opt/rita/docker-compose.yml and uncomment:

    ports:
      - 127.0.0.1:8123:8123

Restart ClickHouse:

    cd /opt/rita && docker compose up -d clickhouse
    curl http://localhost:8123/ping  # should return Ok.

### 2. Clone and configure

    git clone https://github.com/teehootchens/rita-gui.git /opt/rita-gui
    cd /opt/rita-gui
    cp .env.example .env
    nano .env  # set credentials

### 3. Install backend dependencies

    pip3 install -r backend/requirements.txt
    pip3 install python-multipart openpyxl --break-system-packages

### 4. Initialize suppression database

    python3 << PYEOF
    import sqlite3
    conn = sqlite3.connect('/opt/rita-gui/whitelist.db')
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

### 5. Generate bcrypt password hash

    python3 -c "from passlib.hash import bcrypt; print(bcrypt.hash('yourpassword'))"

Add to .env:

    GUI_USERNAME=admin
    GUI_PASSWORD_HASH=$2b$12$...your hash...

### 6. Build frontend

    cd /opt/rita-gui/frontend
    npm install
    npm run build

### 7. Install systemd service

    sudo systemctl daemon-reload
    sudo systemctl enable --now rita-gui

Access the GUI at http://<server-ip>:8080

## Environment Variables

    CLICKHOUSE_HOST=127.0.0.1
    CLICKHOUSE_PORT=8123
    CLICKHOUSE_USER=default
    CLICKHOUSE_PASSWORD=
    GUI_USERNAME=admin
    GUI_PASSWORD_HASH=$2b$12$...bcrypt hash of your password...

## Test Data

    # Inject realistic test data (1 year, with incident weeks)
    python3 inject_test_data.py

    # Remove test data
    python3 inject_test_data.py --delete

## Architecture

    [Security Onion]
        |  zeek_log_transport.sh
        v
    [RITA Server]
        +-- ClickHouse (localhost:8123)
        +-- RITA v5 (imports Zeek logs, populates ClickHouse)
        +-- SQLite (suppression list at /opt/rita-gui/whitelist.db)
        +-- RITA GUI (port 8080, LAN accessible)
                +-- FastAPI backend  ->  queries ClickHouse + SQLite
                +-- React frontend   ->  served as static files

## Notes

- ClickHouse is never exposed to the LAN — GUI queries it over localhost only
- Credentials stored in .env — never committed to git
- whitelist.db excluded from git — back it up separately
- Auth persists for the browser session; all filters persist across refreshes
- Test data rows tagged with special import_id for clean removal
