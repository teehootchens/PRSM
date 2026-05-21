from fastapi import APIRouter, Query
from backend.db import get_client
from backend.time_filter import time_condition
from backend.suppression_filter import get_suppression_conditions
from typing import Optional

router = APIRouter(prefix="/api/threatintel", tags=["threatintel"])

@router.get("")
def get_threatintel(
    dataset: str = Query(...),
    limit: int = Query(500, le=2000),
    min_score: float = Query(0.0),
    since_hours: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    beacon_type: Optional[str] = Query(None),
    threat_intel_only: bool = Query(False),
    protocol: Optional[str] = Query(None),
    show_suppressed: bool = Query(False),
):
    client = get_client()
    time_cond = time_condition(since_hours, date_from, date_to)
    supp_cond = get_suppression_conditions(dataset, show_suppressed)
    conditions = ["threat_intel = true", f"threat_intel_score >= %(min_score)s"]
    if beacon_type: conditions.append("beacon_type = %(beacon_type)s")
    if protocol: conditions.append("has(port_proto_service, %(protocol)s)")
    where = " AND ".join(conditions) + f" {time_cond} {supp_cond}"
    query = f"""
        SELECT
            IPv6NumToString(src) AS src, IPv6NumToString(dst) AS dst,
            fqdn, threat_intel_score, beacon_threat_score,
            threat_intel_data_size_score, count, total_bytes, last_seen,
            port_proto_service, beacon_score, modifier_name, modifier_value,
            ts_intervals, ts_interval_counts, ds_sizes, ds_size_counts,
            analyzed_at, long_conn_score, strobe_score, c2_over_dns_score,
            subdomain_count, prevalence, prevalence_score, prevalence_total,
            network_size, missing_host_count, first_seen_score
        FROM `{dataset}`.threat_mixtape
        WHERE {where}
        ORDER BY threat_intel_score DESC
        LIMIT %(limit)s
    """
    result = client.query(query, parameters={"min_score": min_score, "limit": limit, "beacon_type": beacon_type or "", "protocol": protocol or ""})
    rows = [dict(zip(result.column_names, row)) for row in result.result_rows]
    return {"dataset": dataset, "count": len(rows), "results": rows}
