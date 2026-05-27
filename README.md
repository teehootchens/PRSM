# PRSM — Pattern Recognition and Scoring Matrix

A web-based threat analysis GUI for [RITA v5](https://github.com/activecm/rita) (Real Intelligence Threat Analytics) built as a self-hosted alternative to AC-Hunter.

**PRSM** surfaces beaconing, long connections, DNS tunneling, strobe detection, and threat intel hits from RITA's ClickHouse dataset — giving analysts a fast, filterable, investigative interface over their network telemetry.

---

## Features

### Analysis Pages
- **Dashboard** — summary counts, top threats, detection trend chart, score distribution
- **Investigate** — multi-target IP/CIDR/FQDN investigation with trend chart and unified results
- **Beaconing** — scored connections sorted by threat score with expandable history
- **Long Connections** — persistent outbound sessions by duration
- **DNS Analysis** — C2-over-DNS and DNS tunneling detection
- **Strobe Detection** — high connection count hosts
- **Threat Intel** — connections matching known bad IPs/domains

### Investigate Page
- Chip-style input — type an IP, CIDR, or FQDN and press Enter to add as a target
- OR / AND mode toggle — OR shows rows matching any target, AND shows rows where all targets appear
- Auto-runs on page load with persisted chips
- Trend chart showing Connections, Max Score, and Bytes over time — all toggleable
- Drag-to-zoom on trend chart with Apply as filter button
- Summary cards — max threat score, total connections, bytes, first/last seen, TI hits
- Unified results table across all threat categories with category badges
- Left-click src/dst/fqdn adds to investigation targets
- Right-click offers suppress and Add to global filter options
- All FilterBar filters apply (time range, min score, type, protocol, TI Only, suppressed)

### Filtering
- Global IP/FQDN/CIDR filter persists across all pages
- CIDR notation (10.0.0.0/24) and wildcard (10.0.0.*) support in filter box
- Click any src/dst/fqdn to filter — text selection safe
- Time range: Last 24h, 7d, 30d, 90d, 1yr, All Time, or custom date range
- Drag-to-zoom on trend charts with Apply as filter
- Min score threshold slider
- Beacon type filter (IP / DNS)
- Protocol/port filter (populated from dataset)
- TI Only toggle
- Show/Hide suppressed toggle
- Active filters badge in sidebar — clear individually or all at once

### Suppression
- Right-click any row on any page to suppress src IP, dst IP, or FQDN
- CIDR suppression (8.8.8.0/24 suppresses entire range at ClickHouse level)
- Scopes: Global (all datasets) or per-dataset
- Expiry: 30, 60, 90, 180 days, 1 year, or Permanent
- Optional reason/note
- Suppressed rows highlighted red when visible
- Suppression List page:
  - Manual add with type, scope, expiry, reason
  - Excel import (single column, no header — IPs, CIDRs, FQDNs)
  - Multi-select bulk delete with typed confirmation
  - Grouped display — same IP shown as one row with multiple type badges
  - Individual type removal via badge x

### Dashboard
- Clickable stat cards navigate to analysis pages
- Right-click suppress on top tables
- Detection trend chart with 5 toggleable series
- Score distribution chart
- Dataset coverage date range

### Detail Panel
- Click any row to open slide-out detail panel
- All scores with progress bars
- Beacon interval histogram
- Data size distribution
- Full connection metadata

### Auth
- Login page with bcrypt hashed password
- Session persists across refreshes (sessionStorage)
- No browser popup on failed login

---

## Stack

- **Backend** — Python 3, FastAPI, uvicorn, clickhouse-connect
- **Frontend** — React 18, Vite, TanStack Table, Chart.js
- **Database** — ClickHouse (via RITA v5 Docker)
- **Suppression store** — SQLite (/opt/rita-gui/whitelist.db)
- **Service** — systemd on port 8080

---

## Requirements

- RITA v5.1+ via Docker Compose
- Python 3.10+
- Node.js 22+
- ClickHouse HTTP port 8123 exposed to localhost
- Docker running (service dependency)

---

## Deployment

### 1. Expose ClickHouse to localhost

Edit /opt/rita/docker-compose.yml and add/uncomment under the clickhouse service:

    ports:
      - 127.0.0.1:8123:8123

Restart ClickHouse:

    cd /opt/rita && docker compose up -d clickhouse
    curl http://localhost:8123/ping  # should return Ok.

### 2. Clone the repo

    git clone https://github.com/teehootchens/rita-gui.git /opt/rita-gui
    cd /opt/rita-gui

### 3. Install backend dependencies

    pip3 install fastapi uvicorn clickhouse-connect python-multipart openpyxl passlib[bcrypt] python-dotenv --break-system-packages

### 4. Configure environment

    cp .env.example .env
    nano .env

Generate a bcrypt password hash:

    python3 -c "from passlib.hash import bcrypt; print(bcrypt.hash('yourpassword'))"

Your .env should look like:

    CLICKHOUSE_HOST=127.0.0.1
    CLICKHOUSE_PORT=8123
    CLICKHOUSE_USER=default
    CLICKHOUSE_PASSWORD=
    GUI_USERNAME=admin
    GUI_PASSWORD_HASH=$2b$12$...your hash here...

### 5. Initialize suppression database

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
    print("Done")
    PYEOF

### 6. Build the frontend

    cd /opt/rita-gui/frontend
    npm install
    npm run build
    cd /opt/rita-gui

### 7. Install and start the systemd service

Create the service file:

    sudo tee /etc/systemd/system/rita-gui.service << SVCEOF
    [Unit]
    Description=RITA GUI
    After=network.target docker.service
    Requires=docker.service

    [Service]
    Type=simple
    User=root
    WorkingDirectory=/opt/rita-gui
    ExecStart=/usr/bin/python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
    Restart=on-failure
    RestartSec=5
    Environment=PYTHONPATH=/opt/rita-gui

    [Install]
    WantedBy=multi-user.target
    SVCEOF

Enable and start:

    sudo systemctl daemon-reload
    sudo systemctl enable --now rita-gui
    sudo systemctl status rita-gui

Access the GUI at http://<server-ip>:8080

### 8. Updating after code changes

After pulling new code or editing backend files:

    sudo systemctl restart rita-gui

After pulling new code that includes frontend changes:

    cd /opt/rita-gui/frontend
    npm run build
    cd /opt/rita-gui
    sudo systemctl restart rita-gui

---

## Test Data

    # Inject ~1 year of realistic test data with incident weeks
    python3 inject_test_data.py

    # Remove test data
    python3 inject_test_data.py --delete

---

## Architecture

    [Security Onion / Log Source]
        |  Zeek logs
        v
    [RITA Server]
        +-- RITA v5        (parses Zeek logs -> ClickHouse)
        +-- ClickHouse     (localhost:8123, never exposed to LAN)
        +-- SQLite         (/opt/rita-gui/whitelist.db, suppression list)
        +-- PRSM GUI       (port 8080, LAN accessible)
                +-- FastAPI backend  ->  queries ClickHouse + SQLite
                +-- React frontend   ->  served as static files by FastAPI

---

## Notes

- ClickHouse never exposed to LAN — backend queries over localhost only
- Credentials in .env — never committed to git
- whitelist.db excluded from git — back it up separately
- All filters persist across page refreshes via localStorage
- Auth session persists via sessionStorage (cleared on tab close)
- Suppression uses ClickHouse native isIPAddressInRange() for CIDR matching
- Service runs as root — scope to a dedicated user in production if needed
- Test data tagged with special import_id for clean removal
- python3 binary expected at /usr/bin/python3

---

## Branding

**PRSM** — Pattern Recognition and Scoring Matrix

Named for what RITA actually does: recognizing behavioral patterns in network sessions and scoring them against a threat matrix. Reactive by design — this tool helps you understand what already happened on your network.
