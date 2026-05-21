import secrets
import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from passlib.hash import bcrypt

load_dotenv("/opt/rita-gui/.env")

from backend.routers import beaconing, datasets, longconns, dns, threatintel, strobe, dashboard, protocols, charts

app = FastAPI(title="RITA GUI", version="0.1.0")
security = HTTPBasic(auto_error=False)

GUI_USERNAME = os.getenv("GUI_USERNAME", "admin")
GUI_PASSWORD_HASH = os.getenv("GUI_PASSWORD_HASH", "")

def require_auth(credentials: HTTPBasicCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    ok_user = secrets.compare_digest(credentials.username.encode(), GUI_USERNAME.encode())
    ok_pass = False
    try:
        ok_pass = bcrypt.verify(credentials.password, GUI_PASSWORD_HASH)
    except Exception:
        ok_pass = False
    if not (ok_user and ok_pass):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return credentials.username

app.include_router(beaconing.router,   dependencies=[Depends(require_auth)])
app.include_router(datasets.router,    dependencies=[Depends(require_auth)])
app.include_router(longconns.router,   dependencies=[Depends(require_auth)])
app.include_router(dns.router,         dependencies=[Depends(require_auth)])
app.include_router(threatintel.router, dependencies=[Depends(require_auth)])
app.include_router(strobe.router,      dependencies=[Depends(require_auth)])
app.include_router(dashboard.router,   dependencies=[Depends(require_auth)])
app.include_router(protocols.router,   dependencies=[Depends(require_auth)])
app.include_router(charts.router,     dependencies=[Depends(require_auth)])

@app.get("/health")
def health():
    return {"status": "ok"}

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))
