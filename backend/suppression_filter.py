import sqlite3
from datetime import datetime

DB_PATH = "/opt/PRSM/whitelist.db"

def is_cidr(value: str) -> bool:
    return '/' in value

def strip_ipv6_prefix(col: str) -> str:
    return f"replaceRegexpOne(IPv6NumToString({col}), '^::ffff:', '')"

def get_suppression_conditions(dataset: str, show_suppressed: bool = False) -> str:
    if show_suppressed:
        return ""

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        now = datetime.utcnow().isoformat()
        rows = conn.execute(
            """SELECT value, value_type FROM suppressions
               WHERE (scope = ? OR scope = 'global')
               AND (expires_at IS NULL OR expires_at > ?)""",
            (dataset, now)
        ).fetchall()
        conn.close()
    except Exception:
        return ""

    src_exact, dst_exact, fqdn_exact = [], [], []
    src_cidr,  dst_cidr             = [], []

    for r in rows:
        v = r['value'].replace("'", "''")
        vtype = r['value_type']

        if vtype == 'fqdn':
            fqdn_exact.append(v)
            continue

        if is_cidr(v):
            if vtype == 'src': src_cidr.append(v)
            elif vtype == 'dst': dst_cidr.append(v)
        else:
            ipv6 = f"::ffff:{v}" if ':' not in v and '.' in v else v
            if vtype == 'src': src_exact.append(ipv6)
            elif vtype == 'dst': dst_exact.append(ipv6)

    conditions = []

    if src_exact:
        vals = ', '.join(f"toIPv6('{v}')" for v in src_exact)
        conditions.append(f"src NOT IN ({vals})")
    if dst_exact:
        vals = ', '.join(f"toIPv6('{v}')" for v in dst_exact)
        conditions.append(f"dst NOT IN ({vals})")

    src_clean = strip_ipv6_prefix('src')
    dst_clean = strip_ipv6_prefix('dst')

    for cidr in src_cidr:
        conditions.append(f"NOT isIPAddressInRange({src_clean}, '{cidr}')")
    for cidr in dst_cidr:
        conditions.append(f"NOT isIPAddressInRange({dst_clean}, '{cidr}')")

    if fqdn_exact:
        vals = ', '.join(f"'{v}'" for v in fqdn_exact)
        conditions.append(f"fqdn NOT IN ({vals})")

    if not conditions:
        return ""
    return "AND " + " AND ".join(conditions)


def get_suppressed_values(dataset: str) -> dict:
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        now = datetime.utcnow().isoformat()
        rows = conn.execute(
            """SELECT value, value_type FROM suppressions
               WHERE (scope = ? OR scope = 'global')
               AND (expires_at IS NULL OR expires_at > ?)""",
            (dataset, now)
        ).fetchall()
        conn.close()
    except Exception:
        return {"src": set(), "dst": set(), "fqdn": set(), "src_cidr": [], "dst_cidr": []}

    result = {"src": set(), "dst": set(), "fqdn": set(), "src_cidr": [], "dst_cidr": []}
    for r in rows:
        v = r['value']
        if r['value_type'] == 'fqdn':
            result['fqdn'].add(v)
        elif is_cidr(v):
            result[f"{r['value_type']}_cidr"].append(v)
        else:
            result[r['value_type']].add(v)
    return result
