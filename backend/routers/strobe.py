from fastapi import APIRouter, Query
from backend.db import get_client
from backend.time_filter import time_condition
from typing import Optional

router = APIRouter(prefix="/api/strobe", tags=["strobe"])

@router.get("")
def get_strobe(
    dataset: str = Query(...),
    limit: int = Query(500, le=2000),
    min_score: float = Query(0.0),
    since_hours: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    beacon_type: Optional[str] = Query(None),
    threat_intel_only: bool = Query(False),
    protocol: Optional[str] = Query(None),
):
    client = get_client()
    time_cond = time_condition(since_hours, date_from, date_to)
    conditions = [f"strobe_score >= %(min_score)s", "strobe_score > 0"]
    if beacon_type: conditions.append("beacon_type = %(beacon_type)s")
    if threat_intel_only: conditions.append("threat_intel = true")
    if protocol: conditions.append("has(port_proto_service, %(protocol)s)")
    where = " AND ".join(conditions) + f" {time_cond}"
    query = f"""
        SELECT
            IPv6NumToString(src) AS src, IPv6NumToString(dst) AS dst,
            fqdn, strobe_score, beacon_threat_score, count, total_bytes,
            last_seen, port_proto_service, threat_intel, ts_intervals,
            ts_interval_counts, ds_sizes, ds_size_counts, analyzed_at,
            beacon_score, modifier_name, modifier_value, c2_over_dns_score,
            long_conn_score, prevalence, prevalence_score, prevalence_total,
            network_size, missing_host_count, first_seen_score
        FROM `{dataset}`.threat_mixtape
        WHERE {where}
        ORDER BY strobe_score DESC
        LIMIT %(limit)s
    """
    result = client.query(query, parameters={"min_score": min_score, "limit": limit, "beacon_type": beacon_type or "", "protocol": protocol or ""})
    rows = [dict(zip(result.column_names, row)) for row in result.result_rows]
    return {"dataset": dataset, "count": len(rows), "results": rows}
