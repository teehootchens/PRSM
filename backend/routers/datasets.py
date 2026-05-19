from fastapi import APIRouter
from backend.db import get_client

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

EXCLUDED = {"INFORMATION_SCHEMA", "information_schema", "system", "default", "metadatabase"}

@router.get("")
def list_datasets():
    client = get_client()
    result = client.query("SHOW DATABASES")
    databases = [
        row[0] for row in result.result_rows
        if row[0] not in EXCLUDED
    ]
    return {"datasets": databases}
