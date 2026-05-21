from typing import Optional
from datetime import datetime

def time_condition(
    since_hours: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> str:
    if date_from and date_to:
        return f"AND last_seen >= '{date_from} 00:00:00' AND last_seen <= '{date_to} 23:59:59'"
    elif date_from:
        return f"AND last_seen >= '{date_from} 00:00:00'"
    elif date_to:
        return f"AND last_seen <= '{date_to} 23:59:59'"
    elif since_hours:
        return f"AND last_seen >= now() - INTERVAL {since_hours} HOUR"
    return ""
