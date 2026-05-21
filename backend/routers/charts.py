from fastapi import APIRouter, Query
from backend.db import get_client
from backend.time_filter import time_condition
from typing import Optional

router = APIRouter(prefix="/api/charts", tags=["charts"])

@router.get("")
def get_charts(
    dataset: str = Query(...),
    since_hours: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    min_score: float = Query(0.0),
    beacon_type: Optional[str] = Query(None),
    threat_intel_only: bool = Query(False),
    protocol: Optional[str] = Query(None),
):
    client = get_client()
    time_cond = time_condition(since_hours, date_from, date_to)

    base = []
    if beacon_type: base.append(f"beacon_type = '{beacon_type}'")
    if protocol: base.append(f"has(port_proto_service, '{protocol}')")
    base_where = (" AND " + " AND ".join(base)) if base else ""
    ti_where = "AND threat_intel = true" if threat_intel_only else ""
    ms = min_score

    trend = client.query(f"""
        SELECT
            toDate(last_seen) AS day,
            countIf(beacon_threat_score >= {ms} AND beacon_threat_score > 0) AS beaconing,
            countIf(threat_intel = true AND threat_intel_score >= {ms}) AS ti_hits,
            countIf(long_conn_score >= {ms} AND long_conn_score > 0) AS long_conns,
            countIf(c2_over_dns_score >= {ms} AND c2_over_dns_score > 0) AS dns,
            countIf(strobe_score >= {ms} AND strobe_score > 0) AS strobe
        FROM `{dataset}`.threat_mixtape
        WHERE 1=1 {ti_where} {base_where} {time_cond}
        GROUP BY day ORDER BY day
    """)

    trend_rows = [
        {"day": str(r[0]), "beaconing": r[1], "threat_intel": r[2],
         "long_conns": r[3], "dns": r[4], "strobe": r[5]}
        for r in trend.result_rows
    ]

    dist = client.query(f"""
        SELECT
            countIf(beacon_threat_score >= 0.75) AS critical,
            countIf(beacon_threat_score >= 0.50 AND beacon_threat_score < 0.75) AS high,
            countIf(beacon_threat_score >= 0.25 AND beacon_threat_score < 0.50) AS medium,
            countIf(beacon_threat_score > 0     AND beacon_threat_score < 0.25) AS low
        FROM `{dataset}`.threat_mixtape
        WHERE 1=1 {ti_where} {base_where} {time_cond}
    """)

    dist_row = dist.result_rows[0] if dist.result_rows else (0, 0, 0, 0)
    return {
        "trend": trend_rows,
        "distribution": {"critical": dist_row[0], "high": dist_row[1], "medium": dist_row[2], "low": dist_row[3]}
    }
