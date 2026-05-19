import secrets
import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

load_dotenv("/opt/rita-gui/.env")

from backend.routers import beaconing, datasets

app = FastAPI(title="RITA GUI", version="0.1.0")
security = HTTPBasic()

GUI_USERNAME = os.getenv("GUI_USERNAME", "admin")
GUI_PASSWORD = os.getenv("GUI_PASSWORD", "changeme")

def require_auth(credentials: HTTPBasicCredentials = Depends(security)):
    ok_user = secrets.compare_digest(credentials.username.encode(), GUI_USERNAME.encode())
    ok_pass = secrets.compare_digest(credentials.password.encode(), GUI_PASSWORD.encode())
    if not (ok_user and ok_pass):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

app.include_router(beaconing.router, dependencies=[Depends(require_auth)])
app.include_router(datasets.router, dependencies=[Depends(require_auth)])

@app.get("/health")
def health():
    return {"status": "ok"}

# Serve React frontend — must be last
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))
