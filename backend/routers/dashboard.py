from fastapi import APIRouter, Query
from backend.db import get_client
from backend.time_filter import time_condition
from backend.suppression_filter import get_suppression_conditions
from typing import Optional

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("")
def get_dashboard(
    dataset: str = Query(...),
    since_hours: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    min_score: float = Query(0.0),
    beacon_type: Optional[str] = Query(None),
    threat_intel_only: bool = Query(False),
    protocol: Optional[str] = Query(None),
    show_suppressed: bool = Query(False),
):
    client = get_client()
    time_cond = time_condition(since_hours, date_from, date_to)
    supp_cond = get_suppression_conditions(dataset, show_suppressed)

    base = []
    if beacon_type: base.append(f"beacon_type = '{beacon_type}'")
    if protocol: base.append(f"has(port_proto_service, '{protocol}')")
    base_where = (" AND " + " AND ".join(base)) if base else ""
    ti_where = "AND threat_intel = true" if threat_intel_only else ""

    def where(*extra):
        conditions = list(extra)
        return "WHERE 1=1 " + ti_where + base_where + f" {time_cond}" + (" AND " + " AND ".join(conditions) if conditions else "")

    def count(extra):
        r = client.query(f"SELECT count() FROM `{dataset}`.threat_mixtape {where(extra)}")
        return r.result_rows[0][0] if r.result_rows else 0

    def top(score_col, extra, n=5):
        r = client.query(f"""
            SELECT
                IPv6NumToString(src) AS src, IPv6NumToString(dst) AS dst,
                fqdn, {score_col}, threat_intel,
                total_duration, total_bytes, count, modifier_name
            FROM `{dataset}`.threat_mixtape
            {where(extra)}
            ORDER BY {score_col} DESC
            LIMIT {n}
        """)
        return [dict(zip(r.column_names, row)) for row in r.result_rows]

    def timerange():
        r = client.query(f"SELECT max(last_seen), min(last_seen) FROM `{dataset}`.threat_mixtape {where()}")
        row = r.result_rows[0] if r.result_rows else (None, None)
        return {"latest": str(row[0]) if row[0] else None, "earliest": str(row[1]) if row[1] else None}

    ms = min_score
    return {
        "dataset": dataset,
        "counts": {
            "beaconing":    count(f"beacon_threat_score >= {ms}"),
            "long_conns":   count(f"long_conn_score >= {ms} AND long_conn_score > 0"),
            "dns":          count(f"c2_over_dns_score >= {ms} AND c2_over_dns_score > 0"),
            "threat_intel": count(f"threat_intel = true AND threat_intel_score >= {ms}"),
            "strobe":       count(f"strobe_score >= {ms} AND strobe_score > 0"),
            "ti_beaconing": count(f"threat_intel = true AND beacon_score >= {ms}"),
        },
        "top_beacons":      top("beacon_threat_score", f"beacon_threat_score >= {ms}"),
        "top_threat_intel": top("threat_intel_score",  f"threat_intel = true AND threat_intel_score >= {ms}"),
        "top_long_conns":   top("long_conn_score",     f"long_conn_score >= {ms} AND long_conn_score > 0"),
        "timerange": timerange(),
    }
