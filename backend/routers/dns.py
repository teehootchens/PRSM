from fastapi import APIRouter, Query
from backend.db import get_client

router = APIRouter(prefix="/api/dns", tags=["dns"])

@router.get("")
def get_dns(
    dataset: str = Query(...),
    limit: int = Query(100, le=1000),
):
    client = get_client()
    query = f"""
        SELECT
            IPv6NumToString(src)    AS src,
            IPv6NumToString(dst)    AS dst,
            fqdn,
            c2_over_dns_score,
            c2_over_dns_direct_conn_score,
            beacon_threat_score,
            subdomain_count,
            count,
            last_seen,
            threat_intel
        FROM `{dataset}`.threat_mixtape
        WHERE c2_over_dns_score > 0
        ORDER BY c2_over_dns_score DESC
        LIMIT %(limit)s
    """
    result = client.query(query, parameters={"limit": limit})
    rows = [dict(zip(result.column_names, row)) for row in result.result_rows]
    return {"dataset": dataset, "count": len(rows), "results": rows}
