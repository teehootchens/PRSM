from fastapi import APIRouter, Query
from backend.db import get_client
from backend.time_filter import time_condition
from backend.suppression_filter import get_suppression_conditions, get_suppressed_values
from typing import Optional

router = APIRouter(prefix="/api/beaconing", tags=["beaconing"])

@router.get("")
def get_beaconing(
    dataset: str = Query(...),
    limit: int = Query(500, le=2000),
    min_score: float = Query(0.0),
    max_score: Optional[float] = Query(None),
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

    conditions = [f"beacon_threat_score >= {min_score}"]
    if beacon_type: conditions.append(f"beacon_type = '{beacon_type}'")
    if threat_intel_only: conditions.append("threat_intel = true")
    if protocol: conditions.append(f"has(port_proto_service, '{protocol}')")
    if max_score is not None: conditions.append(f"beacon_threat_score <= {max_score}")
    where = " AND ".join(conditions) + f" {time_cond} {supp_cond}"

    query = f"""
        SELECT
            IPv6NumToString(src) AS src,
            IPv6NumToString(dst) AS dst,
            fqdn, beacon_score, beacon_threat_score,
            ts_score, ds_score, dur_score, hist_score,
            threat_intel, threat_intel_score,
            long_conn_score, strobe_score,
            c2_over_dns_score, c2_over_dns_direct_conn_score,
            count, total_bytes, total_duration, last_seen,
            port_proto_service, beacon_type, prevalence,
            prevalence_score, prevalence_total, network_size,
            missing_host_count, modifier_name, modifier_value,
            subdomain_count, ts_intervals, ts_interval_counts,
            ds_sizes, ds_size_counts, analyzed_at, first_seen_score
        FROM (
            SELECT * FROM `{dataset}`.threat_mixtape
            WHERE {where}
            ORDER BY beacon_threat_score DESC
            LIMIT {limit}
        )
    """
    try:
        result = client.query(query)
    except Exception:
        return {"dataset": dataset, "count": 0, "results": []}
    rows = [dict(zip(result.column_names, row)) for row in result.result_rows]
    if show_suppressed:
        suppressed = get_suppressed_values(dataset)
        for row in rows:
            src_ip = row.get('src', '').replace('::ffff:', '')
            dst_ip = row.get('dst', '').replace('::ffff:', '')
            row['is_suppressed'] = (
                src_ip in suppressed['src'] or
                dst_ip in suppressed['dst'] or
                row.get('fqdn', '') in suppressed['fqdn']
            )
    else:
        for row in rows:
            row['is_suppressed'] = False
    return {"dataset": dataset, "count": len(rows), "results": rows}
