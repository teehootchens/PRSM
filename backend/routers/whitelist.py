from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import sqlite3
import ipaddress
import io

try:
    import openpyxl
except ImportError:
    openpyxl = None

router = APIRouter(prefix="/api/whitelist", tags=["whitelist"])
DB_PATH = "/opt/rita-gui/whitelist.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def expiry_date(days: Optional[int]) -> Optional[str]:
    if days is None:
        return None
    return (datetime.utcnow() + timedelta(days=days)).isoformat()

def clean_ip(value: str) -> str:
    """Strip ::ffff: prefix from IPv4-mapped IPv6 addresses."""
    if value.startswith('::ffff:'):
        return value[7:]
    return value

class SuppressionCreate(BaseModel):
    value: str
    value_type: str       # 'src', 'dst', 'fqdn'
    scope: str            # 'global' or dataset name
    reason: Optional[str] = None
    expires_days: Optional[int] = None  # None = permanent

class SuppressionDelete(BaseModel):
    id: int

@router.get("")
def list_suppressions(scope: Optional[str] = None):
    conn = get_db()
    now = datetime.utcnow().isoformat()
    if scope:
        rows = conn.execute(
            "SELECT * FROM suppressions WHERE (scope = ? OR scope = 'global') AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC",
            (scope, now)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM suppressions WHERE expires_at IS NULL OR expires_at > ? ORDER BY created_at DESC",
            (now,)
        ).fetchall()
    conn.close()
    return {"suppressions": [dict(r) for r in rows]}

@router.get("/active")
def get_active_suppressions(dataset: str):
    """Returns flat lists of suppressed values for query filtering."""
    conn = get_db()
    now = datetime.utcnow().isoformat()
    rows = conn.execute(
        """SELECT value, value_type FROM suppressions
           WHERE (scope = ? OR scope = 'global')
           AND (expires_at IS NULL OR expires_at > ?)""",
        (dataset, now)
    ).fetchall()
    conn.close()

    src_list, dst_list, fqdn_list = [], [], []
    for r in rows:
        if r['value_type'] == 'src':
            src_list.append(r['value'])
        elif r['value_type'] == 'dst':
            dst_list.append(r['value'])
        elif r['value_type'] == 'fqdn':
            fqdn_list.append(r['value'])

    return {"src": src_list, "dst": dst_list, "fqdn": fqdn_list}

@router.post("")
def add_suppression(item: SuppressionCreate):
    value = clean_ip(item.value.strip())
    if not value:
        raise HTTPException(400, "Value cannot be empty")
    if item.value_type not in ('src', 'dst', 'fqdn'):
        raise HTTPException(400, "value_type must be src, dst, or fqdn")

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO suppressions (value, value_type, scope, reason, expires_at)
               VALUES (?, ?, ?, ?, ?)""",
            (value, item.value_type, item.scope, item.reason, expiry_date(item.expires_days))
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(409, f"'{value}' is already suppressed for scope '{item.scope}'")
    conn.close()
    return {"status": "ok", "value": value}

@router.delete("/{suppression_id}")
def delete_suppression(suppression_id: int):
    conn = get_db()
    conn.execute("DELETE FROM suppressions WHERE id = ?", (suppression_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@router.post("/import")
async def import_excel(file: UploadFile = File(...), scope: str = "global", expires_days: Optional[int] = None):
    if openpyxl is None:
        raise HTTPException(500, "openpyxl not installed")

    contents = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True)
    ws = wb.active

    added, skipped, invalid = 0, 0, 0
    conn = get_db()

    for row in ws.iter_rows(values_only=True):
        raw = row[0]
        if raw is None:
            continue
        value = clean_ip(str(raw).strip())
        if not value:
            continue

        # Determine if IP, CIDR, or FQDN
        try:
            ipaddress.ip_network(value, strict=False)
            if '/' in value:
                # CIDR — add as both src and dst
                types = ['src', 'dst']
            else:
                # Plain IP — add as both src and dst
                ipaddress.ip_address(value)
                types = ['src', 'dst']
        except ValueError:
            # Treat as FQDN
            types = ['fqdn']
            if '.' not in value:
                invalid += 1
                continue

        for vtype in types:
            try:
                conn.execute(
                    """INSERT INTO suppressions (value, value_type, scope, reason, expires_at)
                       VALUES (?, ?, ?, 'Imported from Excel', ?)""",
                    (value, vtype, scope, expiry_date(expires_days))
                )
                added += 1
            except sqlite3.IntegrityError:
                skipped += 1

    conn.commit()
    conn.close()
    return {"added": added, "skipped": skipped, "invalid": invalid}
