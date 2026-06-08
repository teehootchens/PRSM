# PRSM — Pattern Recognition and Scoring Matrix

A self-hosted cybersecurity intelligence and analytics GUI built on top of [RITA v5](https://github.com/activecm/rita) (Real Intelligence Threat Analytics). PRSM provides a fast, filterable, investigative web interface over RITA's ClickHouse network telemetry data — a free alternative to AC-Hunter.

PRSM is designed to be deployed directly on top of an existing RITA v5 server.

---

## What PRSM Does

PRSM surfaces and correlates RITA's threat detections across:

- **Master Dashboard** — dataset landing page showing all RITA datasets at a glance with score distribution bars, data freshness indicator, and critical/total counts per dataset; click a card to enter that dataset
- **Dashboard** — per-dataset summary stats, detection trend chart, and Score Distribution band filtering
- **Investigate** — unified multi-target investigation across all threat categories simultaneously
- **Beaconing** — periodic outbound connections indicative of C2
- **Long Connections** — persistent outbound sessions by duration
- **DNS Analysis** — C2-over-DNS and DNS tunneling detection
- **Strobe Detection** — high connection count hosts
- **Threat Intel** — connections matching known bad IPs/domains

Key capabilities across all pages:

- **Chip filter system** — present on every analysis page; add IPs, CIDRs, FQDNs, score expressions (`beacon>75`), or category keywords (`intel`) as filter chips; toggle OR/AND mode; prefix any chip with `!` or `NOT` to exclude
- **Dual score slider** — set both a minimum and maximum score range simultaneously
- **Right-click context menu** — suppress, add to global filter, or pivot to Investigate from any src/dst/FQDN value on any page
- **Shared Hosts view** — on Investigate with a single destination chip active, shows all internal hosts that communicated with that destination
- **Score Distribution band filtering** — click Critical/High/Medium/Low bands on the Dashboard to filter all dashboard content
- **DNS subdomain count badge** — shows subdomain count inline on DNS-active rows (`DNS • 14`)
- **Data freshness indicator** — color-coded "RITA last ingested data" timestamp on every analysis page header; per-card freshness on the Master Dashboard

---

## System Requirements

| Component | Requirement |
|---|---|
| OS | Ubuntu 22.04+ (tested), Debian 12+ |
| Python | 3.10+ |
| Node.js | 18+ |
| npm | Any version bundled with Node 18+ |
| Nginx | Any recent version (apt) |
| RITA | v5.1+ via Docker Compose |
| ClickHouse | Exposed to localhost:8123 |

---

## RITA Requirements

PRSM reads directly from RITA v5's ClickHouse database. RITA must be installed and operational before deploying PRSM.

### Recommended RITA Setup

- **RITA v5.1+** installed via Docker Compose at `/opt/rita`
- **Security Onion** or equivalent sending Zeek logs to the RITA server via `zeek_log_transport.sh`
- Minimum **8GB RAM**, **4 CPU cores** recommended for the RITA server
- ClickHouse data volume mounted to persistent storage

### Expose ClickHouse to Localhost

RITA's ClickHouse runs in Docker. PRSM needs HTTP access on `localhost:8123`. `prsm --install` auto-detects when ClickHouse is running but not port-bound to localhost, patches `docker-compose.yml`, and restarts the container automatically — no manual action needed.

---

## Deployment

`prsm` is the primary install method. On a fresh server, `prsm` is not yet in `PATH`, so run it directly using `bash` from the cloned repo directory:

```bash
cd /opt/PRSM
sudo bash prsm --install
```

The installer copies `prsm` to `/usr/local/bin` at the end of the install. After that, all subsequent commands can be run from anywhere without `bash`:

```bash
sudo prsm --update
sudo prsm --check-updates
```

The script runs as root and handles everything: pre-flight checks, dependency installs, `prsm` service account creation, interactive `.env` setup (prompts for GUI username and password, generates bcrypt hash and token secret automatically), suppression database initialization, frontend build, self-signed SSL certificate generation, Nginx site configuration, systemd service installation and startup, ufw firewall rules, sudoers entry for build operations, and a final health check. PRSM is accessible at `https://<server-ip>` immediately after the script completes.

> Accept the browser certificate warning — this is expected for a self-signed cert.

### CLI Commands

| Command | Description |
|---|---|
| `prsm --install` | Install PRSM on this server |
| `prsm --uninstall` | Remove PRSM from this server |
| `prsm --uninstall --keep-data` | Uninstall but preserve `.env` and `whitelist.db` to `/tmp/prsm-backup/` |
| `prsm --update` | Pull latest PRSM code, update Python packages, rebuild frontend, restart service |
| `prsm --check-updates` | Check all components for available updates (report only, no changes) |
| `prsm --inject-test-data` | Inject ~2,000 rows of synthetic test data into a ClickHouse dataset |
| `prsm --python-update` | Upgrade PRSM Python dependencies |
| `prsm --nginx-update` | Upgrade nginx via apt |
| `prsm --docker-update` | Upgrade Docker (briefly restarts containers) |
| `prsm --node-update` | Upgrade Node.js to latest LTS and rebuild frontend |
| `prsm --rita-update` | Show RITA update instructions (manual process) |
| `prsm --install --offline` | Install without internet access; requires pre-staged packages. See [Offline bundle preparation](#offline-bundle-preparation). |
| `prsm --install --force` | Overwrite an existing `.env` and SSL certificate |

> Always invoke as `sudo prsm <command>`. On first install before `prsm` is in `PATH`, use `sudo bash prsm --install` from the repo directory.

### Offline bundle preparation

For air-gapped servers, prepare the bundle on an internet-connected machine first:

```bash
# On the internet-connected machine:
pip3 download fastapi uvicorn clickhouse-connect \
  python-multipart openpyxl "passlib[bcrypt]" \
  python-dotenv -d ./offline_packages

cd frontend && npm install && cd ..

# Copy the entire PRSM directory to the target server,
# including offline_packages/ and frontend/node_modules/

# On the target server:
sudo prsm --install --offline
```

In offline mode, the script validates that all Python packages are already importable and that `frontend/node_modules/` is present, then proceeds without any downloads.

### Checking for updates

```bash
sudo prsm --check-updates
```

Reports the current status of all PRSM components — no changes are made. Checks:

| Component | Method |
|---|---|
| PRSM | `git fetch` + commit comparison against `origin/main` |
| RITA | GitHub Releases API (latest tag vs installed version) |
| Python packages | `pip3 list --outdated` for PRSM dependencies |
| nginx | `apt list --upgradable` |
| Docker | `apt list --upgradable` |
| Node.js | Installed major version vs latest LTS from NodeSource |

The **Master Dashboard** also shows an amber banner at the top of the page if a PRSM git update is detected automatically on load. Click **✕** to dismiss it for the current session.

### Injecting test data

```bash
sudo prsm --inject-test-data
```

Prompts for a dataset name (default: `sensor250`), warns about what will be created, requires confirmation, then injects approximately 2,000 rows of synthetic test data covering a full year. Useful for verifying a new installation or evaluating PRSM without real RITA data. To remove injected rows: `python3 /opt/PRSM/inject_test_data.py --delete`.

---

## Installation

PRSM is installed using the `prsm` CLI. Manual installation is not supported.
If you need to customize the install (different paths, service user, etc.),
all configurable variables are documented at the top of the `prsm` script.

---

## Architecture

```
[Security Onion / Zeek Log Source]
    | Zeek logs (zeek_log_transport.sh)
    v
[RITA Server]
    +-- RITA v5          (parses Zeek logs → ClickHouse via Docker)
    +-- ClickHouse       (127.0.0.1:8123, never LAN-exposed)
    +-- SQLite           (/opt/PRSM/whitelist.db, suppression list)
    +-- Nginx            (0.0.0.0:443, TLS termination, rate limiting)
    |       |
    |       v
    +-- PRSM Backend     (127.0.0.1:8080, FastAPI/uvicorn, prsm user)
    +-- PRSM Frontend    (React/Vite, served as static files by FastAPI)
              |
              +-- /           Master Dashboard (dataset selection, entry point)
              +-- /dashboard  Per-dataset analysis pages
              +-- /investigate, /beaconing, ...
```

---

## Security Model

| Control | Implementation |
|---|---|
| Transport | TLS 1.2/1.3 via Nginx (self-signed cert) |
| Authentication | HMAC-signed bearer tokens, 8hr expiry, bcrypt password |
| Brute force protection | Nginx rate limit: 5 req/min on `/api/login` |
| Service isolation | Runs as `prsm` system account, not root |
| Network exposure | uvicorn bound to localhost only; ClickHouse localhost only |
| Security headers | HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Failed login logging | Logged to systemd journal with client IP (`journalctl -u prsm`) |
| Secrets | `.env` owned by `prsm` service account, mode `640` — never committed |

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

### Git

```bash
cd /opt/PRSM
git add -A
git commit -m "type: description"
git push
```

If pushing as root fails with "dubious ownership":

```bash
sudo -u prsm git -C /opt/PRSM push
```

### Generate a new bcrypt hash

```bash
python3 -c "from passlib.hash import bcrypt; print(bcrypt.hash('yourpassword'))"
```

---

## Notes

- ClickHouse is never exposed to the LAN — backend queries over localhost only
- `.env` and `whitelist.db` are never committed to git — back them up separately
- Paths are dynamically resolved — no hardcoded `/opt/PRSM` references in code
- Test data can be injected for evaluation: `sudo prsm --inject-test-data` (interactive, prompts for dataset name). Remove injected rows with `python3 /opt/PRSM/inject_test_data.py --delete`
- The current PRSM version (read from `frontend/package.json`) is displayed on the Login page and in the bottom-right corner of the Master Dashboard

---

## Branding

**PRSM** — Pattern Recognition and Scoring Matrix

Named for what RITA actually does: recognizing behavioral patterns in network sessions and scoring them against a threat matrix. Reactive by design — this tool helps analysts understand what already happened on their network.
