from fastapi import APIRouter, Query
from backend.db import get_client
from backend.time_filter import time_condition
from backend.suppression_filter import get_suppression_conditions
from backend.routers.investigate import build_target_conditions, parse_score_filter, parse_category_filter
from typing import Optional

router = APIRouter(prefix="/api/charts", tags=["charts"])

@router.get("")
def get_charts(
    dataset: str = Query(...),
    since_hours: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    min_score: float = Query(0.0),
    max_score: Optional[float] = Query(None),
    beacon_type: Optional[str] = Query(None),
    threat_intel_only: bool = Query(False),
    protocol: Optional[str] = Query(None),
    show_suppressed: bool = Query(False),
    targets: Optional[str] = Query(None),
    not_targets: Optional[str] = Query(None),
    score_filters: Optional[str] = Query(None),
    not_score_filters: Optional[str] = Query(None),
    category_filters: Optional[str] = Query(None),
    not_category_filters: Optional[str] = Query(None),
    and_mode: bool = Query(False),
):
    client = get_client()
    time_cond = time_condition(since_hours, date_from, date_to)
    supp_cond = get_suppression_conditions(dataset, show_suppressed)

    base = []
    if beacon_type: base.append(f"beacon_type = '{beacon_type}'")
    if protocol: base.append(f"has(port_proto_service, '{protocol}')")
    base_where = (" AND " + " AND ".join(base)) if base else ""
    ti_where = "AND threat_intel = true" if threat_intel_only else ""
    ms = min_score
    ceiling = f" AND beacon_threat_score <= {max_score}" if max_score is not None and max_score < 1.0 else ""

    # Build chip-based target and score/category conditions (mirrors investigate.py)
    target_list = [t.strip() for t in targets.split(',') if t.strip()] if targets else []
    not_list    = [t.strip() for t in not_targets.split(',') if t.strip()] if not_targets else []

    score_conds = []
    if score_filters:
        for expr in score_filters.split(','):
            cond = parse_score_filter(expr.strip())
            if cond:
                score_conds.append(cond)
    if category_filters:
        for expr in category_filters.split(','):
            cond = parse_category_filter(expr.strip())
            if cond:
                score_conds.append(cond)

    not_score_conds = []
    if not_score_filters:
        for expr in not_score_filters.split(','):
            cond = parse_score_filter(expr.strip())
            if cond:
                not_score_conds.append(cond)
    if not_category_filters:
        for expr in not_category_filters.split(','):
            cond = parse_category_filter(expr.strip())
            if cond:
                not_score_conds.append(cond)

    if not target_list and not score_conds:
        target_cond = ""
    elif and_mode:
        parts = [f"({build_target_conditions([t])})" for t in target_list]
        parts += [f"({sc})" for sc in score_conds]
        target_cond = "AND (" + " AND ".join(parts) + ")" if parts else ""
    else:
        ip_part = build_target_conditions(target_list) if target_list else None
        or_parts = ([ip_part] if ip_part else []) + score_conds
        target_cond = "AND (" + " OR ".join(or_parts) + ")" if or_parts else ""

    not_parts = [f"NOT ({build_target_conditions([t])})" for t in not_list]
    not_parts += [f"NOT ({c})" for c in not_score_conds]
    not_cond = ("AND " + " AND ".join(not_parts)) if not_parts else ""

    inner_where = f"WHERE 1=1 {ti_where} {target_cond} {not_cond} {base_where} {time_cond} {supp_cond}"
    empty = {"trend": [], "distribution": {"critical": 0, "high": 0, "medium": 0, "low": 0}}

    try:
        trend = client.query(f"""
            SELECT
                toDate(last_seen) AS day,
                countIf(beacon_threat_score >= {ms} AND beacon_threat_score > 0{ceiling}) AS beaconing,
                countIf(threat_intel = true AND threat_intel_score >= {ms}{ceiling}) AS ti_hits,
                countIf(long_conn_score >= {ms} AND long_conn_score > 0{ceiling}) AS long_conns,
                countIf(c2_over_dns_score >= {ms} AND c2_over_dns_score > 0{ceiling}) AS dns,
                countIf(strobe_score >= {ms} AND strobe_score > 0{ceiling}) AS strobe
            FROM (
                SELECT * FROM `{dataset}`.threat_mixtape
                {inner_where}
            )
            GROUP BY day ORDER BY day
        """)
    except Exception:
        return empty

    trend_rows = [
        {"day": str(r[0]), "beaconing": r[1], "threat_intel": r[2],
         "long_conns": r[3], "dns": r[4], "strobe": r[5]}
        for r in trend.result_rows
    ]

    try:
        dist = client.query(f"""
            SELECT
                countIf(beacon_threat_score >= 0.75) AS critical,
                countIf(beacon_threat_score >= 0.50 AND beacon_threat_score < 0.75) AS high,
                countIf(beacon_threat_score >= 0.25 AND beacon_threat_score < 0.50) AS medium,
                countIf(beacon_threat_score > 0     AND beacon_threat_score < 0.25) AS low
            FROM (
                SELECT * FROM `{dataset}`.threat_mixtape
                {inner_where}
            )
        """)
    except Exception:
        return {"trend": trend_rows, "distribution": {"critical": 0, "high": 0, "medium": 0, "low": 0}}

    dist_row = dist.result_rows[0] if dist.result_rows else (0, 0, 0, 0)
    return {
        "trend": trend_rows,
        "distribution": {"critical": dist_row[0], "high": dist_row[1], "medium": dist_row[2], "low": dist_row[3]}
    }
