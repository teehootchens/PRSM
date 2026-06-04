from fastapi import APIRouter, Query
from backend.db import get_client
from typing import Optional

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

EXCLUDED = {"INFORMATION_SCHEMA", "information_schema", "system", "default", "metadatabase"}

@router.get("")
def list_datasets():
    client = get_client()
    result = client.query("SHOW DATABASES")
    databases = [
        row[0] for row in result.result_rows
        if row[0] not in EXCLUDED
    ]
    return {"datasets": databases}

@router.get("/last_seen")
def last_seen(dataset: str = Query(...)):
    """Return the most recent last_seen and analyzed_at timestamps for a dataset."""
    client = get_client()
    r = client.query(f"""
        SELECT max(last_seen), max(analyzed_at)
        FROM `{dataset}`.threat_mixtape
    """)
    row = r.result_rows[0] if r.result_rows else (None, None)
    return {
        "last_seen":   str(row[0]) if row[0] else None,
        "analyzed_at": str(row[1]) if row[1] else None,
    }

@router.get("/summary")
def datasets_summary():
    """Return per-dataset threat score summary for the Master Dashboard."""
    client = get_client()
    result = client.query("SHOW DATABASES")
    names = [row[0] for row in result.result_rows if row[0] not in EXCLUDED]

    summaries = []
    for ds in names:
        try:
            r = client.query(f"""
                SELECT
                    count()                                                   AS total,
                    countIf(beacon_threat_score >= 0.75)                      AS critical,
                    countIf(beacon_threat_score >= 0.50
                            AND beacon_threat_score < 0.75)                   AS high,
                    countIf(beacon_threat_score >= 0.25
                            AND beacon_threat_score < 0.50)                   AS medium,
                    countIf(beacon_threat_score > 0
                            AND beacon_threat_score < 0.25)                   AS low,
                    max(beacon_threat_score)                                   AS max_score,
                    max(last_seen)                                             AS last_seen
                FROM `{ds}`.threat_mixtape
            """)
            row = r.result_rows[0] if r.result_rows else (0, 0, 0, 0, 0, 0, None)
            summaries.append({
                "dataset":   ds,
                "total":     int(row[0]),
                "critical":  int(row[1]),
                "high":      int(row[2]),
                "medium":    int(row[3]),
                "low":       int(row[4]),
                "max_score": float(row[5]) if row[5] else 0.0,
                "last_seen": str(row[6]) if row[6] else None,
            })
        except Exception:
            summaries.append({
                "dataset": ds, "total": 0, "critical": 0,
                "high": 0, "medium": 0, "low": 0,
                "max_score": 0.0, "last_seen": None,
            })

    return {"datasets": summaries}
