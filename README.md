# PRSM — Pattern Recognition and Scoring Matrix

A self-hosted cybersecurity intelligence and analytics GUI built on top of [RITA v5](https://github.com/activecm/rita) (Real Intelligence Threat Analytics). PRSM provides a fast, filterable, investigative web interface over RITA's ClickHouse network telemetry data — a free alternative to AC-Hunter.

PRSM is designed to be deployed directly on top of an existing RITA v5 server.

---

## What PRSM Does

PRSM surfaces and correlates RITA's threat detections across:

- **Beaconing** — periodic outbound connections indicative of C2
- **Long Connections** — persistent outbound sessions by duration
- **DNS Analysis** — C2-over-DNS and DNS tunneling detection
- **Strobe Detection** — high connection count hosts
- **Threat Intel** — connections matching known bad IPs/domains
- **Investigate** — unified multi-target investigation across all categories
- **Dashboard** — summary stats, detection trends, score distribution

---

## System Requirements

| Component | Requirement |
|---|---|
| OS | Ubuntu 22.04+ (tested), Debian 12+ |
| Python | 3.10+ |
| Node.js | 22+ |
| npm | 10+ |
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

RITA's ClickHouse runs in Docker. PRSM needs HTTP access on localhost. Edit `/opt/rita/docker-compose.yml` and add under the `clickhouse` service:

```yaml
ports:
  - 127.0.0.1:8123:8123
```

Restart ClickHouse:

```bash
cd /opt/rita && docker compose up -d clickhouse
curl http://localhost:8123/ping  # should return: Ok.
```

---

## Deployment

> **Note:** A `setup.sh` install script is planned for v1 release. Until then, follow these manual steps.

### 0. Set deployment variables

Run these once in your shell before following the steps below — every command that follows uses them:

```bash
PRSM_DEV_USER=$(whoami)
PRSM_SERVER_IP=$(hostname -I | awk '{print $1}')
echo "Dev user: $PRSM_DEV_USER  |  Server IP: $PRSM_SERVER_IP"
```

### 1. Create the PRSM service account

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin prsm
```

### 2. Clone the repository

```bash
sudo git clone https://github.com/teehootchens/PRSM.git /opt/PRSM
sudo chown -R $PRSM_DEV_USER:$PRSM_DEV_USER /opt/PRSM
cd /opt/PRSM
```

### 3. Install backend dependencies

```bash
pip3 install fastapi uvicorn clickhouse-connect python-multipart openpyxl passlib[bcrypt] python-dotenv --break-system-packages
```

### 4. Configure environment

```bash
cp .env.example .env
```

Generate a bcrypt password hash:

```bash
python3 -c "from passlib.hash import bcrypt; print(bcrypt.hash('yourpassword'))"
```

Generate a token secret:

```bash
python3 -c "import secrets; print('TOKEN_SECRET=' + secrets.token_hex(32))"
```

Edit `.env`:

```
CLICKHOUSE_HOST=127.0.0.1
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
GUI_USERNAME=your_username
GUI_PASSWORD_HASH=$2b$12$...your bcrypt hash...
TOKEN_SECRET=...your generated secret...
```

> `.env` is never committed to git. Back it up separately.

### 5. Initialize suppression database

```bash
python3 << 'EOF'
import sqlite3, os
db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'whitelist.db')
conn = sqlite3.connect(db_path)
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
EOF
```

> `whitelist.db` is never committed to git. Back it up separately.

### 6. Build the frontend

```bash
cd /opt/PRSM/frontend
npm install
cd /opt/PRSM
```

### 7. Create the build script

This script handles frontend builds, ownership fixes, and service restarts in one step:

```bash
cat > /opt/PRSM/build.sh << 'EOF'
#!/bin/bash
set -e
sudo chown -R $SUDO_USER:$SUDO_USER /opt/PRSM/backend/static 2>/dev/null || true
cd /opt/PRSM/frontend
npm run build
sudo chown -R prsm:prsm /opt/PRSM/backend/static
sudo chown $SUDO_USER:prsm /opt/PRSM/.env
sudo chown $SUDO_USER:prsm /opt/PRSM/whitelist.db
sudo chmod 664 /opt/PRSM/whitelist.db
sudo systemctl restart prsm
echo "Build complete"
EOF
chmod +x /opt/PRSM/build.sh
```

Grant the dev user passwordless sudo for build operations:

```bash
sudo tee /etc/sudoers.d/prsm-build << EOF
$PRSM_DEV_USER ALL=(ALL) NOPASSWD: /bin/chown -R $PRSM_DEV_USER\:$PRSM_DEV_USER /opt/PRSM/backend/static
$PRSM_DEV_USER ALL=(ALL) NOPASSWD: /bin/chown -R prsm\:prsm /opt/PRSM/backend/static
$PRSM_DEV_USER ALL=(ALL) NOPASSWD: /bin/chown $PRSM_DEV_USER\:prsm /opt/PRSM/.env
$PRSM_DEV_USER ALL=(ALL) NOPASSWD: /bin/chown $PRSM_DEV_USER\:prsm /opt/PRSM/whitelist.db
$PRSM_DEV_USER ALL=(ALL) NOPASSWD: /bin/chmod 664 /opt/PRSM/whitelist.db
$PRSM_DEV_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart prsm
EOF
```

Run the initial build:

```bash
bash /opt/PRSM/build.sh
```

### 8. Set file ownership

```bash
sudo chown -R prsm:prsm /opt/PRSM/backend/static
sudo chown $PRSM_DEV_USER:prsm /opt/PRSM/.env
sudo chown $PRSM_DEV_USER:prsm /opt/PRSM/whitelist.db
sudo chmod 664 /opt/PRSM/whitelist.db
```

### 9. Install the systemd service

```bash
sudo tee /etc/systemd/system/prsm.service << 'EOF'
[Unit]
Description=PRSM - Pattern Recognition and Scoring Matrix
After=network.target

[Service]
Type=simple
User=prsm
Group=prsm
WorkingDirectory=/opt/PRSM
Environment=PYTHONPATH=/opt/PRSM
ExecStart=/usr/bin/python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now prsm
sudo systemctl status prsm
```

### 10. Install Nginx and configure HTTPS

```bash
sudo apt update && sudo apt install -y nginx
sudo mkdir -p /etc/nginx/ssl

sudo openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/prsm.key \
  -out /etc/nginx/ssl/prsm.crt \
  -subj "/C=US/ST=Local/L=Local/O=PRSM/CN=prsm.local" \
  -addext "subjectAltName=IP:$PRSM_SERVER_IP"

sudo chmod 600 /etc/nginx/ssl/prsm.key
```

Add rate limit zone to nginx.conf:

```bash
sudo sed -i '/http {/a\    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;' /etc/nginx/nginx.conf
```

Create the Nginx site config:

```bash
sudo tee /etc/nginx/sites-available/prsm << 'EOF'
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
EOF

sudo ln -sf /etc/nginx/sites-available/prsm /etc/nginx/sites-enabled/prsm
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable --now nginx
```

### 11. Enable firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
```

### 12. Verify

```bash
ss -tlnp | grep -E "443|80|8080"
```

Expected:
- `127.0.0.1:8080` — uvicorn, localhost only ✅
- `0.0.0.0:443` — Nginx, HTTPS ✅
- `0.0.0.0:80` — Nginx, redirects to HTTPS ✅

Access PRSM at `https://$PRSM_SERVER_IP` — accept the self-signed certificate warning.

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
| Secrets | `.env` owned by dev user, group `prsm`, mode `640` — never committed |

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
- Test data can be injected for evaluation: `python3 inject_test_data.py` (remove with `--delete`)

---

## Branding

**PRSM** — Pattern Recognition and Scoring Matrix

Named for what RITA actually does: recognizing behavioral patterns in network sessions and scoring them against a threat matrix. Reactive by design — this tool helps analysts understand what already happened on their network.
