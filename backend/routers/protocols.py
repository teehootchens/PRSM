from fastapi import APIRouter, Query
from backend.db import get_client

router = APIRouter(prefix="/api/protocols", tags=["protocols"])

@router.get("")
def get_protocols(dataset: str = Query(...)):
    client = get_client()
    try:
        result = client.query(f"""
            SELECT DISTINCT arrayJoin(port_proto_service) AS proto
            FROM `{dataset}`.threat_mixtape
            ORDER BY proto
        """)
        return {"protocols": [row[0] for row in result.result_rows]}
    except Exception:
        return {"protocols": []}
