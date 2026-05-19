from fastapi import APIRouter, Query
from backend.db import get_client

router = APIRouter(prefix="/api/beaconing", tags=["beaconing"])

@router.get("")
def get_beaconing(
    dataset: str = Query(..., description="Dataset name e.g. sensor259"),
    limit: int = Query(100, le=1000),
    min_score: float = Query(0.0),
):
    client = get_client()
    query = f"""
        SELECT
            IPv6NumToString(src)        AS src,
            IPv6NumToString(dst)        AS dst,
            fqdn,
            beacon_score,
            beacon_threat_score,
            ts_score,
            ds_score,
            dur_score,
            hist_score,
            threat_intel,
            threat_intel_score,
            long_conn_score,
            strobe_score,
            c2_over_dns_score,
            count,
            total_bytes,
            total_duration,
            last_seen,
            port_proto_service,
            beacon_type,
            prevalence,
            missing_host_count
        FROM `{dataset}`.threat_mixtape
        WHERE beacon_threat_score >= %(min_score)s
        ORDER BY beacon_threat_score DESC
        LIMIT %(limit)s
    """
    result = client.query(query, parameters={"min_score": min_score, "limit": limit})
    rows = [dict(zip(result.column_names, row)) for row in result.result_rows]
    return {"dataset": dataset, "count": len(rows), "results": rows}
