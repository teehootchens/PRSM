from fastapi import APIRouter, Query
from backend.db import get_client

router = APIRouter(prefix="/api/threatintel", tags=["threatintel"])

@router.get("")
def get_threatintel(
    dataset: str = Query(...),
    limit: int = Query(100, le=1000),
):
    client = get_client()
    query = f"""
        SELECT
            IPv6NumToString(src)    AS src,
            IPv6NumToString(dst)    AS dst,
            fqdn,
            threat_intel_score,
            beacon_threat_score,
            threat_intel_data_size_score,
            count,
            total_bytes,
            last_seen,
            port_proto_service,
            beacon_score,
            modifier_name,
            modifier_value
        FROM `{dataset}`.threat_mixtape
        WHERE threat_intel = true
        ORDER BY threat_intel_score DESC
        LIMIT %(limit)s
    """
    result = client.query(query, parameters={"limit": limit})
    rows = [dict(zip(result.column_names, row)) for row in result.result_rows]
    return {"dataset": dataset, "count": len(rows), "results": rows}
