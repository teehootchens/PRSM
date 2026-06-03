import secrets
import hmac
import hashlib
import time
import os
import logging
from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from dotenv import load_dotenv
from passlib.hash import bcrypt

load_dotenv("/opt/PRSM/.env")

from backend.routers import (
    beaconing, datasets, longconns, dns, threatintel,
    strobe, dashboard, protocols, charts, whitelist, investigate
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prsm.auth")

app = FastAPI(title="PRSM", version="1.0.0")

GUI_USERNAME      = os.getenv("GUI_USERNAME", "admin")
GUI_PASSWORD_HASH = os.getenv("GUI_PASSWORD_HASH", "")
TOKEN_SECRET      = os.getenv("TOKEN_SECRET", "")
TOKEN_TTL         = 8 * 60 * 60  # 8 hours

if not TOKEN_SECRET:
    raise RuntimeError("TOKEN_SECRET not set in .env")

# --- Token helpers ---

def _sign(payload: str) -> str:
    return hmac.new(TOKEN_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()

def create_token(username: str) -> str:
    expires = int(time.time()) + TOKEN_TTL
    payload = f"{username}:{expires}"
    sig = _sign(payload)
    return f"{payload}:{sig}"

def verify_token(token: str) -> str:
    """Returns username if valid, raises 401 otherwise."""
    try:
        username, expires_str, sig = token.rsplit(":", 2)
        expires = int(expires_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    payload = f"{username}:{expires_str}"
    expected = _sign(payload)

    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if time.time() > expires:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")

    return username

def require_auth(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    return verify_token(auth_header[7:])

# --- Login endpoint ---

@app.post("/api/login")
def login(request: Request, body: dict):
    username = body.get("username", "")
    password = body.get("password", "")

    ok_user = secrets.compare_digest(username.encode(), GUI_USERNAME.encode())
    ok_pass = False
    try:
        ok_pass = bcrypt.verify(password, GUI_PASSWORD_HASH)
    except Exception:
        ok_pass = False

    if not (ok_user and ok_pass):
        client_ip = request.headers.get("X-Real-IP", request.client.host)
        logger.warning("Failed login attempt for user '%s' from %s", username, client_ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return {"token": create_token(username)}

# --- Routers ---

deps = [Depends(require_auth)]

app.include_router(beaconing.router,   dependencies=deps)
app.include_router(datasets.router,    dependencies=deps)
app.include_router(longconns.router,   dependencies=deps)
app.include_router(dns.router,         dependencies=deps)
app.include_router(threatintel.router, dependencies=deps)
app.include_router(strobe.router,      dependencies=deps)
app.include_router(dashboard.router,   dependencies=deps)
app.include_router(protocols.router,   dependencies=deps)
app.include_router(charts.router,      dependencies=deps)
app.include_router(whitelist.router,   dependencies=deps)
app.include_router(investigate.router, dependencies=deps)

@app.get("/health")
def health():
    return {"status": "ok"}

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))
