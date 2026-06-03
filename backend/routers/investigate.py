from fastapi import APIRouter, Query
from backend.db import get_client
from backend.time_filter import time_condition
from backend.suppression_filter import get_suppression_conditions
from typing import Optional
import ipaddress
import re

SCORE_COLUMNS = {
    'threat':   'beacon_threat_score',
    'beacon':   'beacon_score',
    'longconn': 'long_conn_score',
    'dns':      'c2_over_dns_score',
    'strobe':   'strobe_score',
    'intel':    'threat_intel_score',
}

# Bare keyword → "has this category tag" condition
CATEGORY_CONDITIONS = {
    'beacon':   'beacon_score > 0',
    'intel':    'threat_intel = true',
    'longconn': 'long_conn_score > 0',
    'dns':      'c2_over_dns_score > 0',
    'strobe':   'strobe_score > 0',
    'threat':   'beacon_threat_score > 0',
}

_SCORE_RE = re.compile(r'^(threat|beacon|longconn|dns|strobe|intel)(>=|<=|>|<|=)(\d{1,3})$', re.IGNORECASE)
_CATEGORY_RE = re.compile(r'^(threat|beacon|longconn|dns|strobe|intel)$', re.IGNORECASE)

def parse_score_filter(expr: str) -> Optional[str]:
    """Parse 'keyword op value' into a SQL condition, or None if invalid.
    Compares in integer space (round(col * 100)) to avoid Float32 precision issues."""
    m = _SCORE_RE.match(expr.strip())
    if not m:
        return None
    keyword, op, val = m.group(1).lower(), m.group(2), int(m.group(3))
    if not (0 <= val <= 100):
        return None
    col = SCORE_COLUMNS[keyword]
    return f"round({col} * 100) {op} {val}"

def parse_category_filter(expr: str) -> Optional[str]:
    """Parse a bare keyword like 'beacon' into its presence SQL condition."""
    m = _CATEGORY_RE.match(expr.strip())
    if not m:
        return None
    return CATEGORY_CONDITIONS[m.group(1).lower()]

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
    targets: str = Query(""),  # comma-separated IPs, CIDRs, FQDNs
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
    score_filters: Optional[str] = Query(None),         # e.g. "beacon>50,threat>=75"
    not_score_filters: Optional[str] = Query(None),     # e.g. "strobe>25"
    category_filters: Optional[str] = Query(None),      # e.g. "beacon,intel"
    not_category_filters: Optional[str] = Query(None),  # e.g. "strobe"
):
    client = get_client()
    raw_list = [t.strip() for t in targets.split(',') if t.strip()]
    inline_not = []
    target_list = []
    for t in raw_list:
        if t.startswith('!'):
            inline_not.append(t[1:].strip())
        elif t.upper().startswith('NOT '):
            inline_not.append(t[4:].strip())
        else:
            target_list.append(t)

    # Parse score filter and category filter expressions into SQL conditions
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

    # Build target condition, merging IP targets and score filters
    if not target_list and not score_conds:
        target_cond = "1=1"
    elif and_mode:
        parts = [f"({build_target_conditions([t])})" for t in target_list]
        parts += [f"({sc})" for sc in score_conds]
        target_cond = " AND ".join(parts) if parts else "1=1"
    else:
        # OR mode — combine IP targets and score conditions with OR
        ip_part = build_target_conditions(target_list) if target_list else None
        or_parts = ([ip_part] if ip_part else []) + score_conds
        target_cond = "(" + " OR ".join(or_parts) + ")" if or_parts else "1=1"

    time_cond = time_condition(since_hours, date_from, date_to)
    supp_cond = get_suppression_conditions(dataset, show_suppressed)
    not_list = inline_not + ([t.strip() for t in not_targets.split(',') if t.strip()] if not_targets else [])
    not_parts = [f"NOT ({build_target_conditions([t])})" for t in not_list]
    not_parts += [f"NOT ({c})" for c in not_score_conds]
    not_cond = ("AND " + " AND ".join(not_parts)) if not_parts else ""

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
