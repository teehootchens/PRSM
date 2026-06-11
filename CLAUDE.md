# PRSM — Pattern Recognition and Scoring Matrix
## Claude Code Project Context

---

## What PRSM Is

PRSM is a self-hosted cybersecurity intelligence and analytics GUI built on top of RITA v5 (Real Intelligence Threat Analytics). It provides a web-based interface for analysts to interact with RITA's ClickHouse data without using the CLI. It is a LAN-only tool, never internet-exposed.

Primary use cases:
- Cyber Threat Intelligence (CTI)
- Incident Response (IR)
- Threat Hunting
- Beaconing and C2 detection
- IOC/TTP correlation
- Behavioral analytics and risk scoring
- ATT&CK mapping

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Backend | Python 3, FastAPI, uvicorn |
| Database | ClickHouse (via RITA v5 Docker) |
| Suppression list | SQLite (`whitelist.db`) |
| Reverse proxy | Nginx (TLS termination) |
| Process manager | systemd (`prsm.service`) |
| Auth | HMAC-signed bearer tokens (8hr expiry) |
| Version control | GitHub (private) — `teehootchens/PRSM` |

---

## Directory Structure

```
/opt/PRSM/
├── backend/
│   ├── main.py               # FastAPI app, auth, router registration, /api/version (public)
│   ├── db.py                 # ClickHouse connection
│   ├── suppression_filter.py # SQLite suppression logic
│   ├── static/               # Built frontend (Vite output)
│   └── routers/
│       ├── beaconing.py
│       ├── charts.py
│       ├── dashboard.py
│       ├── datasets.py       # Includes /api/datasets/summary for Master Dashboard
│       ├── dns.py
│       ├── investigate.py    # Search/filter with chip system, NOT support, shared-hosts endpoint
│       ├── longconns.py
│       ├── protocols.py
│       ├── strobe.py
│       ├── threatintel.py
│       └── whitelist.py      # SQLite CRUD for suppression list
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Router, nav, layout, HelpPanel wiring, PRSM logo nav
│   │   ├── AuthContext.jsx   # Token storage, authHeader provider
│   │   ├── DatasetContext.jsx
│   │   ├── FilterContext.jsx
│   │   ├── assets/
│   │   │   └── prsm-logo.svg
│   │   ├── components/
│   │   │   ├── ChipBar.jsx       # Chip input, OR/AND toggle, InfoTooltip, detectChipType
│   │   │   ├── FilterBar.jsx     # Global min/max score slider + protocol/type/TI filters
│   │   │   ├── HelpPanel.jsx     # Slide-out quick reference panel (? button)
│   │   │   └── SuppressDialog.jsx
│   │   └── pages/
│   │       ├── Beaconing.jsx
│   │       ├── Dashboard.jsx
│   │       ├── DNS.jsx
│   │       ├── Investigate.jsx   # Includes SharedHostsPanel, CategoryBadge (≥ 25% threshold)
│   │       ├── Login.jsx
│   │       ├── LongConns.jsx
│   │       ├── MasterDashboard.jsx  # Dataset selection landing page (route: /)
│   │       ├── Strobe.jsx
│   │       ├── ThreatIntel.jsx
│   │       └── Whitelist.jsx
│   └── index.html
├── prsm                      # CLI tool — all server management commands:
│                             #   --install, --uninstall [--keep-data]
│                             #   --update, --check-updates
│                             #   --inject-test-data
│                             #   --python-update, --nginx-update, --docker-update
│                             #   --node-update, --rita-update
│                             #   --install --offline, --install --force
├── .env                      # Secrets — never committed
├── .gitignore
├── whitelist.db              # SQLite — never committed
└── CLAUDE.md                 # This file
```

---

## Key Architecture Decisions

### Auth
- Login POSTs to `/api/login` with `{ username, password }`
- Backend verifies with bcrypt, returns a signed HMAC token
- Token stored in `sessionStorage` (cleared on tab close)
- Every API request sends `Authorization: Bearer <token>`
- `AuthContext.jsx` exposes `{ token, login, logout, authHeader }`
- All pages use `const { authHeader } = useAuth()` and pass `{ headers: authHeader }` to axios

### ClickHouse
- Always on `127.0.0.1:8123` — never LAN-exposed
- Connection config in `db.py`, reads from `.env`
- RITA v5 schema — primary table is `threat_mixtape` per dataset

### Suppression / Whitelist
- SQLite at `whitelist.db` (path derived dynamically, not hardcoded)
- Managed via `whitelist.py` router and `suppression_filter.py`
- CIDR matching uses ClickHouse native `isIPAddressInRange()`

### Investigate Page
- Chip-based search system with OR/AND toggle (persisted in `localStorage`)
- NOT support: chips are `{ value, negate }` objects
- Negative chips render red with NOT badge
- NOT chips always treated as mandatory exclusions regardless of OR/AND mode
- Backend receives `targets`, `and_mode`, `not_targets`, `score_filters`, `not_score_filters`, `category_filters`, `not_category_filters`
- `build_target_conditions()` in `investigate.py` handles IP, CIDR, FQDN parsing
- **Shared Hosts view** — enabled when exactly one non-negated target chip is active; calls `/api/investigate/shared-hosts`; "Investigate all sources" button adds all returned IPs as OR-mode chips
- **Category badges** in `CategoryBadge` component use threshold `>= 0.25` (25%); category keyword chips filter server-side at `> 0`
- **Chip types**: `target` (IP/CIDR/FQDN), `score` (e.g. `beacon>75`), `category` (bare keyword like `intel`)

### Version Endpoint
- `GET /api/version` in `main.py` — **no auth required**; reads `version` from `frontend/package.json` at startup, returns `{ "version": "x.y.z" }` or `"unknown"` on read failure
- Fetched by `Login.jsx` and `MasterDashboard.jsx` on mount to display the version string

### Frontend State
- Dataset selection: `DatasetContext`
- Global filters (min score, protocol): `FilterContext`
- Auth: `AuthContext`
- Per-page filters: `localStorage`

---

## Infrastructure

### Services
```
prsm.service     — uvicorn on 127.0.0.1:8080, runs as prsm user
nginx            — TLS termination on 0.0.0.0:443, proxies to 8080
```

### Nginx
- Config: `/etc/nginx/sites-available/prsm`
- SSL certs: `/etc/nginx/ssl/prsm.crt` and `prsm.key`
- Rate limiting on `/api/login`: 5 req/min per IP
- Security headers: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy

### systemd
- Service file: `/etc/systemd/system/prsm.service`
- User: `prsm` (system account, no shell)
- WorkingDirectory: `/opt/PRSM`
- PYTHONPATH: `/opt/PRSM`

### .env keys
```
GUI_USERNAME
GUI_PASSWORD_HASH     # bcrypt hash
TOKEN_SECRET          # 32-byte hex, HMAC signing key
CLICKHOUSE_HOST       # 127.0.0.1
CLICKHOUSE_PORT       # 8123
CLICKHOUSE_USER       # default
```

---

## Development Workflow

### After backend changes
```bash
sudo systemctl restart prsm
sudo journalctl -u prsm --no-pager -n 20
```

### After frontend changes
```bash
bash /opt/PRSM/build.sh
```

### Git (run as your-username or use prsm user)
```bash
cd /opt/PRSM
git add -A
git commit -m "type: description"
git push
# If running as root, use: sudo -u prsm git -C /opt/PRSM ...
```

### Generate bcrypt password hash
```bash
python3 -c "from passlib.hash import bcrypt; print(bcrypt.hash('yourpassword'))"
```

---

## Nav Order (App.jsx)
- `/` → MasterDashboard (no shell/sidebar — full-screen dataset picker)
- Shell routes (sidebar + nav):
  1. Dashboard
  2. Investigate
  3. Beaconing
  4. Long Connections
  5. DNS Analysis
  6. Strobe Detection
  7. Threat Intel
  8. Suppression List
- Clicking PRSM logo in sidebar navigates to `/` (MasterDashboard)

---

## Known Issues / Watch Out For
- `whitelist.db` and `.env` must never be committed — both in `.gitignore`
- `investigate.router` and `whitelist.router` were previously registered multiple times — fixed, do not re-introduce
- Git operations as root will fail with "dubious ownership" — use your dev user or `sudo -u prsm git`
- The `prsm` user owns `/opt/PRSM` at runtime; use your local dev user for git operations
- Nginx `limit_req_zone` lives in `/etc/nginx/nginx.conf` http block — do not add it to the site config too
- `MasterDashboard.jsx` update banner still says `sudo bash setup.sh --update` — needs updating to `sudo prsm --update`

---

## Deferred / Roadmap
- KQL or Lucene query language for Investigate page
- Firewall subnet scoping (deferred — not portable across deployments)
- Failed login UI dashboard (logs go to journald via `journalctl -u prsm`)

---

## Guiding Principles
- Preserve working functionality — no rewrites without clear benefit
- Step-by-step with verification before proceeding
- Security tool for real SOC/CTI workflows — keep analyst usability in mind
- Modular backend — new data types get new routers
- No sensitive data ever committed to git
