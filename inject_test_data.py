"""
RITA GUI -- Test Data Injector
Injects realistic test data into threat_mixtape covering a full year.
All test rows have import_id starting with b'TESTDATA' for easy cleanup.

Usage:
    python3 inject_test_data.py            # inject a year of data
    python3 inject_test_data.py --delete   # remove all test rows
"""

import os
import sys
import random
import uuid
import ipaddress
from datetime import datetime, timedelta, timezone

try:
    import clickhouse_connect
except ImportError:
    print("ERROR: clickhouse-connect not installed.")
    sys.exit(1)

# ---- configurable ----
DATASET = os.environ.get("PRSM_TEST_DATASET", "sensor250")
# ----------------------

TABLE = f"{DATASET}.threat_mixtape"
TEST_IMPORT_ID = b"TESTDATA" + b"\x00" * 8

client = clickhouse_connect.get_client(
    host="127.0.0.1", port=8123,
    username="default", password="",
)

# ---------- schema bootstrap ----------

def ensure_schema():
    client.command(f"CREATE DATABASE IF NOT EXISTS {DATASET}")
    client.command(f"""
CREATE TABLE IF NOT EXISTS {DATASET}.threat_mixtape
(
    `analyzed_at` DateTime64(6),
    `import_id` FixedString(16),
    `hash` FixedString(16),
    `src` IPv6,
    `dst` IPv6,
    `src_nuid` UUID,
    `dst_nuid` UUID,
    `fqdn` String,
    `server_ips` Array(IPv6),
    `proxy_ips` Array(IPv6),
    `total_bytes` UInt64,
    `last_seen` DateTime,
    `port_proto_service` Array(String),
    `count` UInt64,
    `ts_unique` UInt64,
    `proxy_count` UInt64,
    `open_count` UInt64,
    `beacon_type` LowCardinality(String),
    `beacon_score` Float64,
    `beacon_threat_score` Float64,
    `ts_score` Float64,
    `ds_score` Float64,
    `dur_score` Float64,
    `hist_score` Float64,
    `ts_intervals` Array(Int64),
    `ts_interval_counts` Array(Int64),
    `ds_sizes` Array(Int64),
    `ds_size_counts` Array(Int64),
    `total_duration` Float64,
    `long_conn_score` Float64,
    `strobe_score` Float64,
    `subdomain_count` UInt64,
    `c2_over_dns_score` Float64,
    `c2_over_dns_direct_conn_score` Float64,
    `threat_intel` Bool,
    `threat_intel_score` Float64,
    `modifier_name` LowCardinality(String),
    `modifier_score` Float64,
    `modifier_value` String,
    `prevalence_total` UInt64,
    `prevalence` Float64,
    `prevalence_score` Float64,
    `network_size` UInt64,
    `first_seen_historical` DateTime,
    `first_seen_score` Float64,
    `threat_intel_data_size_score` Float64,
    `missing_host_count` UInt64,
    `missing_host_header_score` Float64
)
ENGINE = MergeTree
PRIMARY KEY (analyzed_at, dst_nuid, src_nuid, src, fqdn, dst, hash)
ORDER BY (analyzed_at, dst_nuid, src_nuid, src, fqdn, dst, hash)
SETTINGS index_granularity = 8192
""")
    print(f"Schema ready: {TABLE}")

# ---------- helpers ----------

def rand_internal_ip():
    return ipaddress.IPv6Address(f"::ffff:10.{random.randint(1,10)}.{random.randint(1,254)}.{random.randint(1,254)}")

def rand_external_ip():
    return ipaddress.IPv6Address(f"::ffff:{random.randint(1,223)}.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}")

def rand_hash():
    return bytes(random.randint(0, 255) for _ in range(16))

def proto_service():
    return random.choice([["443:tcp:ssl"], ["80:tcp:http"], ["53:udp:dns"], ["8080:tcp:http"], ["22:tcp:ssh"]])

# Incident weeks — higher scores and more detections
INCIDENT_WEEKS = {10, 23, 35, 44}  # week numbers with incidents

def is_incident_week(dt):
    return dt.isocalendar()[1] % 52 in INCIDENT_WEEKS

def is_weekday(dt):
    return dt.weekday() < 5

def make_base(src, dst, fqdn, beacon_type, count, total_bytes, total_duration, ts):
    return {
        "analyzed_at":              datetime.now(timezone.utc),
        "import_id":                TEST_IMPORT_ID,
        "hash":                     rand_hash(),
        "src":                      src,
        "dst":                      dst,
        "src_nuid":                 uuid.uuid4(),
        "dst_nuid":                 uuid.uuid4(),
        "fqdn":                     fqdn,
        "server_ips":               [dst],
        "proxy_ips":                [],
        "total_bytes":              total_bytes,
        "last_seen":                ts,
        "port_proto_service":       proto_service(),
        "count":                    count,
        "ts_unique":                count,
        "proxy_count":              0,
        "open_count":               0,
        "beacon_type":              beacon_type,
        "beacon_score":             0.0,
        "beacon_threat_score":      0.0,
        "ts_score":                 0.0,
        "ds_score":                 0.0,
        "dur_score":                0.0,
        "hist_score":               0.0,
        "ts_intervals":             [random.randint(30, 3600) for _ in range(5)],
        "ts_interval_counts":       [random.randint(1, 50) for _ in range(5)],
        "ds_sizes":                 [random.randint(100, 5000) for _ in range(5)],
        "ds_size_counts":           [random.randint(1, 20) for _ in range(5)],
        "total_duration":           total_duration,
        "long_conn_score":          0.0,
        "strobe_score":             0.0,
        "subdomain_count":          0,
        "c2_over_dns_score":        0.0,
        "c2_over_dns_direct_conn_score": 0.0,
        "threat_intel":             False,
        "threat_intel_score":       0.0,
        "modifier_name":            "",
        "modifier_score":           0.0,
        "modifier_value":           "",
        "prevalence_total":         random.randint(1, 50),
        "prevalence":               round(random.uniform(0.01, 0.5), 4),
        "prevalence_score":         round(random.uniform(0.0, 0.8), 4),
        "network_size":             random.randint(50, 500),
        "first_seen_historical":    ts - timedelta(days=random.randint(1, 30)),
        "first_seen_score":         round(random.uniform(0.0, 1.0), 4),
        "threat_intel_data_size_score": 0.0,
        "missing_host_count":       0,
        "missing_host_header_score": 0.0,
    }

BEACON_FQDNS = [
    "update.windowsdefender-cdn.com", "telemetry.microsoft-update.net",
    "cdn.analytics-tracker.io", "check-in.beacon-host.ru",
    "api.totally-legit-service.com", "pool.ntp-sync.xyz",
    "updates.adobe-helper.net", "ping.cloud-telemetry.cc",
    "metrics.app-analytics.biz", "sync.device-check.io",
]
DNS_FQDNS = [
    "aGVsbG8ud29ybGQ.evil-dns.ru", "exfil.dns-tunnel.cc",
    "data.dnscat2-server.io", "c2.dns-exfil.xyz",
    "tunnel.iodine-host.net",
]
TI_FQDNS  = ["malware-c2.ru", "botnet-panel.xyz", "ransomware-host.cc", "cobalt-strike-beacon.io"]
TI_FEEDS  = ["emerging-threats", "abuse.ch", "tor-exit-nodes", "feodo-tracker"]

COLUMNS = [
    "analyzed_at", "import_id", "hash", "src", "dst", "src_nuid", "dst_nuid",
    "fqdn", "server_ips", "proxy_ips", "total_bytes", "last_seen",
    "port_proto_service", "count", "ts_unique", "proxy_count", "open_count",
    "beacon_type", "beacon_score", "beacon_threat_score", "ts_score", "ds_score",
    "dur_score", "hist_score", "ts_intervals", "ts_interval_counts", "ds_sizes",
    "ds_size_counts", "total_duration", "long_conn_score", "strobe_score",
    "subdomain_count", "c2_over_dns_score", "c2_over_dns_direct_conn_score",
    "threat_intel", "threat_intel_score", "modifier_name", "modifier_score",
    "modifier_value", "prevalence_total", "prevalence", "prevalence_score",
    "network_size", "first_seen_historical", "first_seen_score",
    "threat_intel_data_size_score", "missing_host_count", "missing_host_header_score",
]

def rows_to_data(rows):
    return [[row[c] for c in COLUMNS] for row in rows]

def gen_day(dt):
    rows = []
    incident  = is_incident_week(dt)
    weekday   = is_weekday(dt)

    # Scale counts by day type
    multiplier = 1.0
    if incident: multiplier *= 3.0
    if not weekday: multiplier *= 0.3

    # Beaconing
    n_beacon = max(1, int(random.randint(3, 8) * multiplier))
    for _ in range(n_beacon):
        src = rand_internal_ip()
        dst = rand_external_ip()
        score = round(random.uniform(0.55 if not incident else 0.75, 0.99), 4)
        ts = dt + timedelta(hours=random.uniform(0, 23))
        row = make_base(src, dst, random.choice(BEACON_FQDNS), "ip",
                        random.randint(200, 2000),
                        random.randint(50000, 5000000),
                        round(random.uniform(10, 300), 2), ts)
        row.update({
            "beacon_score":        score,
            "beacon_threat_score": min(round(score * random.uniform(0.8, 1.0), 4), 1.0),
            "ts_score":            round(random.uniform(0.5, 0.99), 4),
            "ds_score":            round(random.uniform(0.4, 0.95), 4),
            "dur_score":           round(random.uniform(0.3, 0.9), 4),
            "hist_score":          round(random.uniform(0.4, 0.95), 4),
        })
        rows.append(row)

    # Long connections
    n_long = max(0, int(random.randint(1, 3) * multiplier))
    for _ in range(n_long):
        src = rand_internal_ip()
        dst = rand_external_ip()
        score = round(random.uniform(0.6, 0.99), 4)
        ts = dt + timedelta(hours=random.uniform(0, 23))
        row = make_base(src, dst, "", "ip", random.randint(1, 10),
                        random.randint(1000000, 500000000),
                        round(random.uniform(3600, 86400), 2), ts)
        row.update({
            "long_conn_score":     score,
            "beacon_threat_score": round(score * 0.5, 4),
        })
        rows.append(row)

    # DNS
    n_dns = max(0, int(random.randint(0, 2) * multiplier))
    for _ in range(n_dns):
        src = rand_internal_ip()
        dst = ipaddress.IPv6Address("::ffff:8.8.8.8")
        score = round(random.uniform(0.6, 0.99), 4)
        ts = dt + timedelta(hours=random.uniform(0, 23))
        row = make_base(src, dst, random.choice(DNS_FQDNS), "dns",
                        random.randint(500, 5000),
                        random.randint(10000, 500000),
                        round(random.uniform(1, 60), 2), ts)
        row.update({
            "c2_over_dns_score":             score,
            "c2_over_dns_direct_conn_score": round(score * random.uniform(0.5, 0.9), 4),
            "subdomain_count":               random.randint(50, 500),
            "beacon_threat_score":           round(score * 0.6, 4),
            "port_proto_service":            ["53:udp:dns"],
        })
        rows.append(row)

    # Threat intel
    n_ti = max(0, int(random.randint(0, 2) * multiplier))
    for _ in range(n_ti):
        src = rand_internal_ip()
        dst = rand_external_ip()
        feed = random.choice(TI_FEEDS)
        score = round(random.uniform(0.7, 1.0), 4)
        ts = dt + timedelta(hours=random.uniform(0, 23))
        row = make_base(src, dst, random.choice(TI_FQDNS), "ip",
                        random.randint(10, 500),
                        random.randint(5000, 50000000),
                        round(random.uniform(1, 3600), 2), ts)
        row.update({
            "threat_intel":             True,
            "threat_intel_score":       score,
            "threat_intel_data_size_score": round(random.uniform(0.3, 0.9), 4),
            "beacon_threat_score":      round(score * random.uniform(0.6, 1.0), 4),
            "beacon_score":             round(random.uniform(0.3, 0.9), 4),
            "modifier_name":            feed,
            "modifier_score":           round(random.uniform(0.5, 1.0), 4),
            "modifier_value":           str(dst).replace("::ffff:", ""),
        })
        rows.append(row)

    # Strobe — rare, more likely during incidents
    if incident and random.random() < 0.4 or random.random() < 0.05:
        src = rand_internal_ip()
        dst = rand_external_ip()
        score = round(random.uniform(0.7, 0.99), 4)
        ts = dt + timedelta(hours=random.uniform(0, 23))
        row = make_base(src, dst, "", "ip",
                        random.randint(10000, 100000),
                        random.randint(1000000, 50000000),
                        round(random.uniform(1, 60), 2), ts)
        row.update({
            "strobe_score":        score,
            "beacon_threat_score": round(score * 0.7, 4),
        })
        rows.append(row)

    return rows

def insert():
    ensure_schema()
    now = datetime.now(timezone.utc)
    end   = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = end - timedelta(days=365)

    total = 0
    batch = []
    current = start

    print(f"Generating data from {start.date()} to {end.date()}...")

    while current <= end:
        batch.extend(gen_day(current))
        current += timedelta(days=1)

        # Insert in batches of 500 to avoid memory issues
        if len(batch) >= 500:
            client.insert(TABLE, rows_to_data(batch), column_names=COLUMNS)
            total += len(batch)
            print(f"  Inserted {total} rows... ({current.date()})")
            batch = []

    if batch:
        client.insert(TABLE, rows_to_data(batch), column_names=COLUMNS)
        total += len(batch)

    print(f"\nDone. Inserted {total} total rows into {TABLE}")
    print(f"Incident weeks simulated: weeks {sorted(INCIDENT_WEEKS)}")
    print(f"\nTo remove: sudo prsm --delete-test-data {DATASET}")

def delete():
    ensure_schema()
    client.command(
        f"ALTER TABLE {TABLE} DELETE WHERE import_id = %(id)s",
        parameters={"id": TEST_IMPORT_ID},
    )
    print(f"Deleted all test rows from {TABLE}")

if __name__ == "__main__":
    if "--delete" in sys.argv:
        delete()
    else:
        insert()
