from fastapi import APIRouter, Query
from backend.db import get_client
from backend.time_filter import time_condition
from backend.suppression_filter import get_suppression_conditions
from typing import Optional
import ipaddress

router = APIRouter(prefix="/api/investigate", tags=["investigate"])

def build_target_conditions(targets: list[str]) -> str:
    """Build WHERE conditions for a list of IPs, CIDRs, and FQDNs."""
    ip_exact, ip_cidr, fqdns = [], [], []

    for t in targets:
        t = t.strip()
        if not t:
            continue
        if '/' in t:
            ip_cidr.append(t.replace("'", "''"))
        elif '.' in t:
            try:
                ipaddress.ip_address(t)
                ipv6 = f"::ffff:{t}"
                ip_exact.append(ipv6)
            except ValueError:
                fqdns.append(t.replace("'", "''"))

    parts = []

    if ip_exact:
        vals = ', '.join(f"toIPv6('{v}')" for v in ip_exact)
        parts.append(f"(src IN ({vals}) OR dst IN ({vals}))")

    for cidr in ip_cidr:
        parts.append(
            f"(isIPAddressInRange(replaceRegexpOne(IPv6NumToString(src), '^::ffff:', ''), '{cidr}') OR "
            f"isIPAddressInRange(replaceRegexpOne(IPv6NumToString(dst), '^::ffff:', ''), '{cidr}'))"
        )

    if fqdns:
        vals = ', '.join(f"'{v}'" for v in fqdns)
        parts.append(f"fqdn IN ({vals})")

    if not parts:
        return "1=0"  # no valid targets

    return "(" + " OR ".join(parts) + ")"


@router.get("")
def investigate(
    dataset: str = Query(...),
    targets: str = Query(...),  # comma-separated IPs, CIDRs, FQDNs
    since_hours: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    show_suppressed: bool = Query(False),
    limit: int = Query(500, le=2000),
    min_score: float = Query(0.0),
    beacon_type: Optional[str] = Query(None),
    threat_intel_only: bool = Query(False),
    protocol: Optional[str] = Query(None),
    and_mode: bool = Query(False),
    not_targets: Optional[str] = Query(None),
):
    client = get_client()
    target_list = [t.strip() for t in targets.split(',') if t.strip()]

    # If no targets specified, show all data (unfiltered by target)
    if not target_list:
        target_cond = "1=1"
    elif and_mode and len(target_list) > 1:
        # AND mode — each target must appear somewhere in the row
        parts = [build_target_conditions([t]) for t in target_list]
        target_cond = " AND ".join(f"({p})" for p in parts)
    else:
        target_cond = build_target_conditions(target_list)

    time_cond = time_condition(since_hours, date_from, date_to)
    supp_cond = get_suppression_conditions(dataset, show_suppressed)
    not_list = [t.strip() for t in not_targets.split(',') if t.strip()] if not_targets else []
    if not_list:
        not_parts = [f"NOT ({build_target_conditions([t])})" for t in not_list]
        not_cond = "AND " + " AND ".join(not_parts)
    else:
        not_cond = ""

    extra = []
    if min_score > 0:
        extra.append(f"beacon_threat_score >= {min_score}")
    if beacon_type:
        extra.append(f"beacon_type = '{beacon_type}'")
    if threat_intel_only:
        extra.append("threat_intel = true")
    if protocol:
        extra.append(f"has(port_proto_service, '{protocol}')")
    extra_cond = ("AND " + " AND ".join(extra)) if extra else ""

    base_where = f"WHERE {target_cond} {time_cond} {supp_cond} {extra_cond} {not_cond}"

    # Summary stats
    summary_q = client.query(f"""
        SELECT
            count()                          AS total_connections,
            max(beacon_threat_score)         AS max_beacon_score,
            sum(total_bytes)                 AS total_bytes,
            min(ls)                          AS first_seen,
            max(ls)                          AS last_seen,
            countIf(threat_intel = true)     AS ti_hits,
            max(long_conn_score)             AS max_long_conn_score,
            max(c2_over_dns_score)           AS max_dns_score,
            max(strobe_score)                AS max_strobe_score
        FROM (
            SELECT *, last_seen AS ls FROM `{dataset}`.threat_mixtape
            {base_where}
        )
    """)
    sr = summary_q.result_rows[0] if summary_q.result_rows else None
    summary = {}
    if sr:
        cols = summary_q.column_names
        summary = dict(zip(cols, sr))
        # Convert datetimes to strings
        for k in ('first_seen', 'last_seen'):
            if summary.get(k):
                summary[k] = str(summary[k])

    # Trend — daily counts, max score, total bytes
    trend_q = client.query(f"""
        SELECT
            toDate(last_seen)            AS day,
            count()                      AS connections,
            max(beacon_threat_score)     AS max_score,
            sum(total_bytes)             AS bytes
        FROM (
            SELECT * FROM `{dataset}`.threat_mixtape
            {base_where}
        )
        GROUP BY day
        ORDER BY day
    """)
    trend = [
        {
            "day":         str(row[0]),
            "connections": row[1],
            "max_score":   round(row[2], 4),
            "bytes":       row[3],
        }
        for row in trend_q.result_rows
    ]

    # Unified results table
    results_q = client.query(f"""
        SELECT
            IPv6NumToString(src)        AS src,
            IPv6NumToString(dst)        AS dst,
            fqdn,
            beacon_threat_score,
            beacon_score,
            long_conn_score,
            c2_over_dns_score,
            strobe_score,
            threat_intel,
            threat_intel_score,
            count,
            total_bytes,
            total_duration,
            last_seen,
            port_proto_service,
            beacon_type,
            modifier_name,
            modifier_value,
            ts_intervals,
            ts_interval_counts,
            ds_sizes,
            ds_size_counts,
            analyzed_at,
            ts_score, ds_score, dur_score, hist_score,
            prevalence, prevalence_score, prevalence_total,
            network_size, missing_host_count, first_seen_score,
            subdomain_count, c2_over_dns_direct_conn_score
        FROM (
            SELECT * FROM `{dataset}`.threat_mixtape
            {base_where}
            ORDER BY beacon_threat_score DESC
            LIMIT {limit}
        )
    """)
    results = [dict(zip(results_q.column_names, row)) for row in results_q.result_rows]

    return {
        "targets":  target_list,
        "dataset":  dataset,
        "summary":  summary,
        "trend":    trend,
        "results":  results,
        "count":    len(results),
    }
