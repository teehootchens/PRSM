from fastapi import APIRouter, Query
from backend.db import get_client

router = APIRouter(prefix="/api/longconns", tags=["longconns"])

@router.get("")
def get_longconns(
    dataset: str = Query(...),
    limit: int = Query(100, le=1000),
):
    client = get_client()
    query = f"""
        SELECT
            IPv6NumToString(src)    AS src,
            IPv6NumToString(dst)    AS dst,
            fqdn,
            long_conn_score,
            beacon_threat_score,
            total_duration,
            count,
            total_bytes,
            last_seen,
            port_proto_service,
            threat_intel
        FROM `{dataset}`.threat_mixtape
        WHERE long_conn_score > 0
        ORDER BY long_conn_score DESC
        LIMIT %(limit)s
    """
    result = client.query(query, parameters={"limit": limit})
    rows = [dict(zip(result.column_names, row)) for row in result.result_rows]
    return {"dataset": dataset, "count": len(rows), "results": rows}
