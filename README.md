# RITA GUI

A web-based GUI for [RITA v5](https://github.com/activecm/rita) (Real Intelligence Threat Analytics) built as a self-hosted alternative to AC-Hunter.

## Features

- **Beaconing** — scored connections sorted by threat score with expandable history
- **Long Connections** — persistent outbound sessions by duration
- **DNS Analysis** — C2-over-DNS and DNS tunneling detection
- **Threat Intel** — connections matching known bad IPs/domains from threat feeds
- **Strobe Detection** — high connection count hosts
- Cross-page IP/FQDN filter that persists across page navigation and refreshes
- Dataset picker for multiple sensors
- Login with HTTP Basic auth

## Stack

- **Backend** — Python 3, FastAPI, clickhouse-connect
- **Frontend** — React 18, Vite, TanStack Table
- **Database** — ClickHouse (via RITA v5's Docker deployment)
- **Deployment** — systemd service, served on port 8080

## Requirements

- RITA v5.1+ running via Docker Compose
- Python 3.10+
- Node.js 22+

## Setup

### 1. Expose ClickHouse HTTP port to localhost

Edit `/opt/rita/docker-compose.yml` and uncomment:
```yaml
ports:
  - 127.0.0.1:8123:8123
```

Restart ClickHouse:
```bash
cd /opt/rita && docker compose up -d clickhouse
curl http://localhost:8123/ping  # should return Ok.
```

### 2. Clone and configure

```bash
git clone https://github.com/yourusername/rita-gui.git /opt/rita-gui
cd /opt/rita-gui
cp .env.example .env
nano .env  # set credentials
```

### 3. Install backend dependencies

```bash
pip3 install -r backend/requirements.txt
```

### 4. Build frontend

```bash
cd frontend
npm install
npm run build
```

### 5. Install systemd service

```bash
sudo cp rita-gui.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rita-gui
```

Access the GUI at `http://<server-ip>:8080`

## Environment Variables

Create `/opt/rita-gui/.env`:

```env
CLICKHOUSE_HOST=127.0.0.1
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
GUI_USERNAME=admin
GUI_PASSWORD=changeme
```

## Test Data

A test data injector is included for development:

```bash
# Inject 50 realistic test rows
python3 inject_test_data.py

# Remove test rows
python3 inject_test_data.py --delete
```

## Architecture
[Security Onion]
│  zeek_log_transport.sh
▼
[RITA Server]
├── ClickHouse (localhost:8123)
├── RITA v5 (imports Zeek logs, populates ClickHouse)
└── RITA GUI (port 8080, LAN accessible)
├── FastAPI backend  →  queries ClickHouse
└── React frontend   →  served as static files
## Notes

- ClickHouse is never exposed to the LAN — GUI queries it over localhost only
- Credentials stored in `.env` — never committed to git
- Auth persists for the browser session; filter and dataset selection persist across refreshes
- Test data rows are tagged with a special import_id for clean removal
