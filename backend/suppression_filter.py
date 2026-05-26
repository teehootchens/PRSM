import sqlite3
from datetime import datetime

DB_PATH = "/opt/rita-gui/whitelist.db"

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

    src_list, dst_list, fqdn_list = [], [], []
    for r in rows:
        v = r['value'].replace("'", "''")
        ipv6 = f"::ffff:{v}" if ':' not in v and '.' in v else v
        if r['value_type'] == 'src': src_list.append(ipv6)
        elif r['value_type'] == 'dst': dst_list.append(ipv6)
        elif r['value_type'] == 'fqdn': fqdn_list.append(v)

    conditions = []
    if src_list:
        vals = ', '.join(f"toIPv6('{v}')" for v in src_list)
        conditions.append(f"src NOT IN ({vals})")
    if dst_list:
        vals = ', '.join(f"toIPv6('{v}')" for v in dst_list)
        conditions.append(f"dst NOT IN ({vals})")
    if fqdn_list:
        vals = ', '.join(f"'{v}'" for v in fqdn_list)
        conditions.append(f"fqdn NOT IN ({vals})")

    if not conditions:
        return ""
    return "AND " + " AND ".join(conditions)


def get_suppressed_values(dataset: str) -> dict:
    """Returns sets of suppressed values for client-side row flagging."""
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
        return {"src": set(), "dst": set(), "fqdn": set()}

    result = {"src": set(), "dst": set(), "fqdn": set()}
    for r in rows:
        result[r['value_type']].add(r['value'])
    return result
