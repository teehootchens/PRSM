# PRSM User Guide

---

## Table of Contents

1. [What is PRSM](#1-what-is-prsm)
2. [Getting Started](#2-getting-started)
3. [Page Reference](#3-page-reference)
4. [The Investigate Page — Deep Dive](#4-the-investigate-page--deep-dive)
5. [Interactions Reference](#5-interactions-reference)
6. [Suppression](#6-suppression)
7. [Score Reference](#7-score-reference)
8. [Analyst Workflow Examples](#8-analyst-workflow-examples)

---

## 1. What is PRSM

### What RITA does

RITA (Real Intelligence Threat Analytics) analyzes Zeek network logs and scores connections for suspicious behavior. It looks for beaconing (periodic outbound connections consistent with C2 check-in), long-duration connections, C2-over-DNS tunneling, strobe behavior (high connection count to a single host), and matches against threat intelligence feeds. The output is a scored dataset in ClickHouse.

### What PRSM adds

RITA produces data. PRSM makes it usable. PRSM is the analyst interface — a web GUI that lets you browse, filter, search, pivot, and investigate RITA's scored results without touching the command line or writing ClickHouse SQL.

The core workflow is:

1. RITA ingests Zeek logs and scores connections overnight (or on a schedule)
2. PRSM reads that scored data and presents it across dedicated analysis pages
3. Analysts triage results, investigate suspicious connections, pivot between views, and suppress known-good traffic

### What PRSM is not

- **Not a SIEM.** PRSM does not ingest raw events, generate alerts, or correlate across log sources beyond what RITA already processes.
- **Not real-time.** PRSM shows scored data from the last RITA run. The **RITA last ingested data** indicator in the upper right of every analysis page shows how fresh the current dataset is.
- **Not a packet capture tool.** PRSM works with Zeek connection metadata — src, dst, port, byte counts, duration, timing. It does not display packet payloads.

---

## 2. Getting Started

### Logging in

Navigate to `https://<server-ip>` and log in with your credentials. The browser will warn about a self-signed certificate — this is expected. PRSM uses a locally-issued cert to encrypt traffic on the LAN.

The current PRSM version is displayed at the bottom of the login page, below the **PATTERN RECOGNITION AND SCORING MATRIX** subtitle.

Your session is stored in `sessionStorage`, which means it persists across page refreshes within the same tab but is cleared when you close the tab. This is intentional — closing the browser ends your session without requiring an explicit logout.

### Master Dashboard and dataset selection

After logging in, you land on the **Master Dashboard** — a full-screen overview of all available RITA datasets. Each dataset card shows the dataset name, data freshness, total scored connections, critical-severity count, max score, and a proportion bar breaking down connections by severity band. Click any card to select that dataset and enter the analysis section.

Once inside the analysis section, the dataset picker at the top of the left sidebar lets you switch datasets at any time without returning to the Master Dashboard. Clicking the **PRSM logo** at the top of the sidebar returns you to the Master Dashboard. Everything you see — every score, every connection, every count — comes from whichever dataset is selected.

### Data freshness indicator

The upper right corner of every analysis page shows **RITA last ingested data** with a color-coded relative timestamp:

- **Green** — data is less than 12 hours old
- **Yellow** — 12–48 hours old (RITA may be delayed)
- **Red** — older than 48 hours (check whether RITA is running and receiving logs)

### The global filter bar

The FilterBar appears at the top of every analysis page. All controls in it apply globally and persist across refreshes. Changes to any filter immediately reload data on the current page.

| Control | What it does |
|---|---|
| **Time** | Restricts data to a time window. Options: Last 24h, 7d, 30d, 90d, 1yr, All Time, or Custom date range. Custom shows two date pickers. |
| **Score** (dual-handle slider) | Sets a minimum and maximum score range. The left handle is the floor (default 0%), the right handle is the ceiling (default 100%). Values are displayed above the track. Moving either handle manually clears any active Score Distribution band selection on the Dashboard. |
| **Type** | Filters by beacon type — IP (direct IP connections) or DNS (DNS-based beaconing). Leave blank for all. |
| **Protocol** | Filters by port/protocol/service. Populated from the current dataset. Leave blank for all. |
| **TI Only** | When ON, restricts results to rows that have a threat intelligence hit. |
| **Suppressed** | When ON (Show), suppressed rows appear in results highlighted in red. When OFF (Hide, the default), suppressed rows are excluded entirely. |
| **Reset Filters** | Appears when any filter is active. Clears all filters at once. |

The left sidebar also shows an **active filters badge** when filters are set, listing each active filter with an individual clear button.

---

## 3. Page Reference

### Master Dashboard

The Master Dashboard is the entry point after login. It shows all available RITA datasets before any dataset is selected, giving analysts an immediate cross-dataset overview without entering a specific dataset first.

**Update available banner** — If a PRSM git update is detected on load, an amber banner appears at the top of the page with the command to run (`sudo prsm --update`). Click **✕** to dismiss it for the current session. It reappears on the next login if the update is still pending.

**Version** — The current PRSM version is displayed in the bottom-right corner of the page in small muted text.

**Dataset cards** — One card per RITA dataset. Each card shows:
- Dataset name
- **Last seen** — color-coded freshness: green (< 12h), yellow (12–48h), red (> 48h). A **⚠ stale** label appears when data is more than 24 hours old.
- **Total** — total scored connections in the dataset
- **Critical** — count of connections scoring ≥ 75%
- **Max Score** — highest threat score in the dataset
- **Proportion bar** — visual breakdown of Critical/High/Medium/Low severity across all connections

Click a card to select that dataset and navigate to the Dashboard for detailed analysis.

---

### Dashboard

The Dashboard is the starting point for a triage session. It does not show raw connection rows — it shows aggregates and trends.

**Stat cards** — Six clickable cards at the top show counts for each detection category (Beaconing, Long Connections, C2 over DNS, Threat Intel, Strobe, TI + Beacon). Click any card to navigate directly to that page.

**Top tables** — Three tables below the stat cards show the top 5 results for Beaconing, Threat Intel, and Long Connections respectively. Each row shows TI hit status, score, source IP, and destination/FQDN. Left-clicking a source or destination value adds it as a local Dashboard chip filter. Right-clicking opens a context menu with Suppress, Add to global filter, and Pivot to Investigate options.

**Detection trend chart** — A line chart showing daily detection counts across all five categories. Each series is toggleable by clicking its label. Drag across the chart to zoom into a time range, then click **Apply as filter** to set that range as the active time filter. Click **Reset zoom** to restore the full view.

**Score distribution** — A horizontal bar chart showing how many connections fall into each severity band:

| Band | Score range |
|---|---|
| Critical | ≥ 75% |
| High | 50–74% |
| Medium | 25–49% |
| Low | 1–24% |

Clicking a band selects it and filters the entire Dashboard — stat cards, top tables, and trend chart — to only include connections in that score range. Click multiple bands to select a range (e.g. Critical + High shows 50–100%). When bands are selected, the score range slider in the FilterBar updates to reflect the floor and ceiling of the selected range. Moving the slider manually deselects all active bands.

**Dashboard chip filter** — A chip filter bar appears between the FilterBar and the content area. Left-clicking any src/dst/fqdn in the top tables adds a chip here. Chips filter all three top tables simultaneously. Supports the same chip syntax as Investigate (IPs, CIDRs, FQDNs, score expressions, category keywords, OR/AND mode, NOT prefix).

---

### Investigate

The Investigate page is the primary deep-dive tool. It searches across all threat categories simultaneously and returns a unified view of every scored connection matching your targets.

See [Section 4](#4-the-investigate-page--deep-dive) for full documentation.

---

### Beaconing

Shows connections scored for periodic, clock-like outbound behavior consistent with C2 check-in. Sorted by `beacon_threat_score` (the composite score) descending by default.

**Columns:** Threat Score, Beacon Score, Source, Destination, FQDN, TI Hit, Connections, Type (IP/DNS), Last Seen.

**What to look for:**
- High Beacon Score combined with high Threat Score — the connection fires regularly and looks suspicious on multiple dimensions
- TI Hit = YES on a beaconing connection — strong indicator of known-bad C2
- Low connection count with high score — low-and-slow beaconing designed to avoid volume-based detection
- Beacon type DNS — the host is beaconing via DNS queries rather than direct IP connections

**Chip filter bar** — A chip filter bar appears below the FilterBar. Left-clicking any src/dst/fqdn in the table adds a chip here. The chip bar filters results client-side after fetching. Supports IPs, CIDRs, FQDNs, score expressions, category keywords, OR/AND mode, and NOT prefix.

---

### Long Connections

Shows connections that stayed open for an unusually long time. Sorted by `long_conn_score` descending.

**Columns:** Score, Source, Destination, FQDN, Duration, Total Bytes, Connections, TI Hit, Last Seen.

**What to look for:**
- High duration (hours or days) to an external IP — persistent C2 channels or data staging
- High bytes on a long connection — possible exfiltration
- TI Hit on a long connection — confirms a known-bad destination
- Protocol context in Connection Details — legitimate long connections are often database or VPN traffic; unusual protocols on long connections are more suspicious

**Chip filter bar** — A chip filter bar appears below the FilterBar. Left-clicking any src/dst/fqdn in the table adds a chip here. Chips filter results client-side after fetching. Supports IPs, CIDRs, FQDNs, score expressions, category keywords, OR/AND mode, and NOT prefix. Chips persist in `localStorage` under the key `longconns_chips`.

---

### DNS Analysis

Shows connections scored for C2-over-DNS and DNS tunneling activity. Sorted by `c2_over_dns_score` descending.

**Columns:** C2/DNS Score, Direct Conn Score, Source, Destination, FQDN, Subdomains, Queries, TI Hit, Last Seen.

**What to look for:**
- High subdomain count — DNS tunneling tools (like `iodine` or `dnscat`) generate large numbers of unique subdomains. The **DNS • N** badge on Investigate rows shows this count at a glance.
- High query count to a single domain — excessive DNS queries to one domain are abnormal
- C2/DNS Score vs Direct Conn Score — Direct Conn Score measures whether the DNS target is also being connected to directly; a high DNS score with zero Direct Conn score suggests DNS-only tunneling
- Short, frequently-queried domain names with high entropy in subdomains — common tunneling pattern

**Chip filter bar** — A chip filter bar appears below the FilterBar. Left-clicking any src/dst/fqdn in the table adds a chip here. Chips filter results client-side after fetching. Supports IPs, CIDRs, FQDNs, score expressions, category keywords, OR/AND mode, and NOT prefix. Chips persist in `localStorage` under the key `dns_chips`.

---

### Strobe Detection

Shows hosts that made an unusually high number of individual connections to a single destination. Sorted by `strobe_score` descending. If no strobe connections are present, the page shows a green confirmation message.

**Columns:** Strobe Score, Threat Score, Source, Destination, FQDN, Connections, Total Bytes, TI Hit, Last Seen.

**What strobe means in RITA's context:** A strobe is a high connection count to one destination in a short period — not beaconing (which is about timing regularity) but sheer volume. Strobes appear in port scanners, vulnerability scanners, some malware C2 protocols, and occasionally legitimate monitoring tools. The key question is whether the destination justifies that connection volume.

**What to look for:**
- Very high connection count (thousands or tens of thousands) to a single external IP — likely scanning or C2 flooding
- Strobe + Beaconing on the same pair — the host is both strobing and beaconing, a strong C2 indicator
- Internal src to external dst — strobing to external addresses is more suspicious than internal network scanning

**Chip filter bar** — A chip filter bar appears below the FilterBar. Left-clicking any src/dst/fqdn in the table adds a chip here. Chips filter results client-side after fetching. Supports IPs, CIDRs, FQDNs, score expressions, category keywords, OR/AND mode, and NOT prefix. Chips persist in `localStorage` under the key `strobe_chips`.

---

### Threat Intel

Shows connections where the destination IP or FQDN matched a threat intelligence feed. Sorted by `threat_intel_score` descending. If no TI hits exist, the page shows a green confirmation message.

**Columns:** TI Score, Beacon Score, Source, Destination, FQDN, Feed, Indicator, Total Bytes, Connections, Last Seen.

**What to look for:**
- The **Feed** column identifies which TI feed matched (e.g., a specific blocklist name)
- The **Indicator** column shows the specific matched indicator from that feed
- Beacon Score on a TI hit — if the host is also beaconing to a TI-matched destination, treat it as confirmed C2
- Multiple source IPs hitting the same TI destination — possible lateral movement or shared C2 infrastructure
- TI hits against FQDNs vs IPs — FQDN-based hits survive IP rotation; IP-based hits may have higher false positive rates depending on the feed

**Chip filter bar** — A chip filter bar appears below the FilterBar. Left-clicking any src/dst/fqdn in the table adds a chip here. Chips filter results client-side after fetching. Supports IPs, CIDRs, FQDNs, score expressions, category keywords, OR/AND mode, and NOT prefix. Chips persist in `localStorage` under the key `threatintel_chips`.

---

### Suppression List

The Suppression List shows all active suppression entries across all datasets. See [Section 6](#6-suppression) for full suppression documentation.

---

## 4. The Investigate Page — Deep Dive

### Overview

Investigate searches RITA's `threat_mixtape` table — a unified view that includes every scored connection regardless of which category it falls into. You can search by IP, CIDR, FQDN, score thresholds, or category presence, and see all matching connections in one table with all their scores side by side.

### Adding chips

The chip input is the search bar at the top of the page. To add a chip:

1. Click in the input area and type a value
2. Press **Enter**, **comma**, or **space** to commit it as a chip

To remove a chip, click the **✕** on the chip badge, or press **Backspace** when the input is empty to remove the last chip.

Supported chip types:

- **IP address** — `10.4.11.107` matches rows where src or dst is that IP
- **CIDR range** — `10.4.0.0/16` matches any src or dst in that subnet
- **FQDN** — `evil.example.com` matches rows where fqdn contains that value
- **Score expression** — `beacon>50` matches rows where beacon score is above 50%
- **Category keyword** — `beacon` matches rows where beacon score is above 0 (i.e., the Beacon tag is shown)

### OR vs AND mode

The **OR / AND** toggle controls how multiple chips are evaluated:

- **OR** (default) — a row matches if it satisfies **any** chip. Use OR to cast a wide net across multiple suspects: `10.4.11.107, 10.4.11.108` returns rows involving either IP.
- **AND** — a row matches only if it satisfies **all** chips. Use AND to find intersections: `10.4.11.107` + `beacon>75` in AND mode returns only rows where that specific IP has a high beacon score.

Score filter chips and category chips follow the same OR/AND logic as IP chips.

### NOT operator

Prefix any chip value with `!` or `NOT ` (case-insensitive, space required after NOT) to exclude rows matching that value:

```
!10.4.11.107
NOT 10.4.11.107
```

Both syntaxes work identically. NOT chips are always applied as mandatory exclusions regardless of the OR/AND mode setting — they are never OR'd against positive chips.

Example: `10.4.0.0/16` with `!10.4.11.1` returns all rows involving that subnet except the known gateway.

### Score filter chips

Score filter chips let you filter by any individual score column. The syntax is:

```
keyword operator value
```

Where:
- `keyword` is one of: `threat`, `beacon`, `longconn`, `dns`, `strobe`, `intel`
- `operator` is one of: `>`, `<`, `>=`, `<=`, `=`
- `value` is an integer from 0 to 100 (treated as a percentage)

Examples:

```
beacon>75
threat>=50
longconn<25
dns=0
strobe>90
intel>=1
```

Score comparisons are done in integer space (the stored float score × 100, rounded) to avoid floating-point boundary issues. `beacon>95` finds rows strictly above 95%, and `beacon=95` finds exactly 95%.

### Category keyword chips

Typing a bare keyword without an operator filters for rows that have any score in that category. This is a wider net than the badge display threshold (≥ 25%):

```
beacon       → rows where beacon_score > 0
intel        → rows where threat_intel = true
longconn     → rows where long_conn_score > 0
dns          → rows where c2_over_dns_score > 0
strobe       → rows where strobe_score > 0
threat       → rows where beacon_threat_score > 0
```

These chips render in the same color as their corresponding category badge so you can visually connect the chip to the rows it matches. Category keyword chips are the fastest way to isolate all connections belonging to a detection category without guessing a score threshold.

### Score and IP chips together

Score chips and IP/FQDN chips participate in the same OR/AND toggle:

- **AND mode:** `10.4.11.107` + `beacon>75` → rows involving that IP AND scoring above 75% beacon
- **OR mode:** `10.4.11.107` + `beacon>75` → rows involving that IP OR any row with high beacon score

### Reading the results table

**Category badges** appear in the Categories column and indicate which threat categories the connection is active in. A badge appears when the corresponding score reaches ≥ 25%:

| Badge | Appears when |
|---|---|
| Beacon | `beacon_score ≥ 25%` |
| Long | `long_conn_score ≥ 25%` |
| DNS | `c2_over_dns_score ≥ 25%` |
| TI | `threat_intel = true` (no score threshold) |
| Strobe | `strobe_score ≥ 25%` |

> **Note:** Category *keyword chips* (`beacon`, `longconn`, etc.) filter server-side at `> 0` — they surface all rows where the category has any score, even below 25%. This is intentional: category chips cast a wide net; badges show only meaningfully-scored detections.

The **DNS badge** shows the subdomain count inline when it is greater than zero: **DNS • 14**. A high subdomain count is the primary indicator of DNS tunneling.

**Row grouping** — When multiple rows share the same src/dst/fqdn combination, they are collapsed into a single primary row. A **▼** expand button appears in the leftmost column. Click it to expand and see the child rows (historical entries for the same connection pair).

**Pagination** — Results are shown 100 rows per page. Use the **«« ‹ Prev / Page N of M / Next › »»** controls at the bottom to navigate.

### Chevron and row interactions

Each row has a **›** chevron at the far right that brightens when you hover over the row. It is a visual affordance indicating the row is clickable for Connection Details. When a row is expanded (children visible), the chevron rotates to point down.

- **Click anywhere in the row except a src/dst/fqdn value** → opens the Connection Details panel
- **Click the src, dst, or fqdn text directly** → adds that value as a chip in the Investigate chip bar
- **Right-click the src, dst, or fqdn text** → opens a context menu: Suppress, Add to global filter, Pivot to Investigate
- **Right-click anywhere else in the row** → opens a context menu with View Details only

### Connection Details panel

Clicking a row (anywhere except the value text) opens a slide-out panel from the right edge of the screen. The panel shows:

**Connection** — Source IP, destination IP, FQDN, beacon type (IP/DNS), protocols/ports, connection count, total bytes, total duration, last seen timestamp, and the time RITA analyzed this connection.

**Threat Scores** — All individual score dimensions displayed as progress bars with percentage labels:
- Threat Score (composite)
- Beacon Score
- Timestamp Score (ts_score) — regularity of connection timing
- Datasize Score (ds_score) — consistency of data sizes across connections
- Duration Score (dur_score)
- Histogram Score (hist_score) — shape of the connection timing histogram
- Long Conn Score
- Strobe Score
- C2/DNS Score
- First Seen Score — penalty for newly-seen connections
- Prevalence Score — how common this destination is across the network

**Threat Intel** — Only shown if there is a TI hit. Shows TI score, the feed name, and the specific matched indicator.

**DNS** — Only shown if c2_over_dns_score > 0 or subdomain_count > 0. Shows C2/DNS score, Direct Connection score, and subdomain count.

**Prevalence** — Shows what percentage of hosts in the network communicated with this destination, the total host count, and the network size. Low prevalence to an external destination is suspicious.

**Beacon Intervals** — A histogram of the time gaps between consecutive connections. A regular, consistent pattern (narrow bars concentrated around one interval) is the visual signature of automated beaconing.

**Data Size Distribution** — A histogram of data sizes across connections. Consistent data sizes combined with regular intervals are strong beaconing indicators.

Close the panel by clicking the **✕** button or clicking anywhere on the dimmed backdrop.

### Shared Hosts view

When exactly one non-negated target chip (an IP, CIDR, or FQDN — not a score or category chip) is active, a **Shared Hosts** tab becomes available next to the **Activity over time** tab.

Click **Shared Hosts** to switch the view panel to a table of all internal source IPs that communicated with the target destination in the current dataset and time range. The table shows:

- **Source IP** — the internal host that talked to the target. Left-click to add it as a chip in the Investigate bar. Right-click for suppress / global filter / pivot options.
- **Threat Score** — max threat score for that host's connections to this destination, displayed as a color-coded progress bar
- **Connections** — total connection count
- **Total Bytes** — total bytes transferred
- **Last Seen** — most recent connection timestamp

**Investigate all sources** — a button below the table adds all listed source IPs as chips in a single operation, switching to OR mode automatically. This is the fastest way to pivot from "who talks to this destination?" to a full investigation across all those hosts.

The Shared Hosts view respects all active global filters (time range, score range, show suppressed).

Switching chips, changing the dataset, or navigating away automatically returns the panel to **Activity over time**.

---

### Trend chart

Below the summary cards, the Activity over time chart shows daily counts for Connections, Max Score, and Bytes. Each series is toggleable using the labeled buttons above the chart. When more than 60 days of data is visible, drag across the chart to zoom into a specific range. When zoomed, an **Apply as filter** button sets that date range as the active time filter, and a **Reset zoom** button restores the full view.

### Summary cards

The eight cards above the trend chart show aggregates for the current search results:

- Max Threat Score, Total Connections, Total Bytes, First Seen, Last Seen, TI Hits, Max Long Conn (score), Max C2/DNS (score)

These update whenever the chip set or filters change.

---

## 5. Interactions Reference

### PRSM logo

Clicking the **PRSM logo** at the top of the left sidebar returns to the Master Dashboard (dataset selection screen) from any analysis page.

### Left-click src/dst/FQDN

Left-clicking a source IP, destination IP, or FQDN value in a table cell adds it as a filter:

| Page | Left-click behavior |
|---|---|
| Investigate | Adds the value as a chip in the Investigate chip bar |
| Beaconing | Adds the value as a chip in the Beaconing chip bar |
| Long Connections | Adds the value as a chip in the Long Connections chip bar |
| DNS Analysis | Adds the value as a chip in the DNS Analysis chip bar |
| Strobe Detection | Adds the value as a chip in the Strobe Detection chip bar |
| Threat Intel | Adds the value as a chip in the Threat Intel chip bar |
| Dashboard (top tables) | Adds the value as a chip in the Dashboard chip bar |
| Shared Hosts (Investigate) | Adds the source IP as a chip in the Investigate chip bar |

Text selection is protected — if you click and drag to select text, the filter/chip action does not fire.

### Right-click src/dst/FQDN

Right-clicking any src/dst/fqdn **value text** on any page opens a context menu:

1. **Suppress: [value]** — opens the Suppress dialog for that specific field (src, dst, or fqdn — the menu knows which one was clicked)
2. **Add to global filter: [value]** — adds the value to the global filter that persists across all pages
3. **Pivot to Investigate: [value]** — navigates to the Investigate page with that value pre-loaded as a chip

### Right-click elsewhere in a row

Right-clicking anywhere on a row **outside** of a src/dst/fqdn value opens a one-item menu:

- **View Details** — opens the Connection Details panel for that row

### Context menu dismissal

The context menu closes when you click anywhere outside it or press **Escape**.

### Local chip filter vs global filter

**Local chips** (Investigate, Beaconing, Long Connections, DNS Analysis, Strobe Detection, Threat Intel, and Dashboard chip bars) only affect the page they belong to. Navigating away and back preserves the chips — they persist in `localStorage` per page.

**Global filter** (the FilterBar and the sidebar badge) affects all pages simultaneously and also persists in `localStorage`.

### Pivot to Investigate

Pivot to Investigate is the fastest way to correlate a suspicious value across all threat categories:

1. Right-click any src/dst/fqdn value on any page
2. Select **Pivot to Investigate**
3. PRSM navigates to the Investigate page with that value loaded as the only chip
4. Any previously loaded Investigate chips are replaced
5. The current dataset carries over
6. The minimum score resets to 0 so all scored results for that value are visible

---

## 6. Suppression

### When to suppress

Suppression is for traffic you have confirmed is legitimate and do not want to see in results. Common candidates:

- Internal monitoring tools with regular check-ins that score high for beaconing
- Known SaaS destinations (telemetry, update servers) with regular traffic patterns
- Vulnerability scanners or network monitoring hosts that generate strobe-level traffic
- Specific known-good TI hits from feeds with high false positive rates

Do not suppress a host just because you have not investigated it yet. Investigate first — if it is confirmed legitimate, then suppress.

### How to suppress

Right-click any src, dst, or fqdn **value text** on any page and select **Suppress: [value]**. A dialog opens with the following options:

- **Type** — whether you are suppressing the value as a Source IP, Destination IP, or FQDN (pre-filled based on which field you right-clicked)
- **Scope** — Global (suppressed in all datasets) or per-dataset
- **Expiry** — 30 days, 60 days, 90 days, 180 days, 1 year, or Permanent
- **Reason** — optional free-text note (useful for auditing)

### CIDR suppression

You can suppress entire subnets. Enter a CIDR range like `10.0.0.0/24` in the Suppression List's Add form. ClickHouse evaluates CIDR matches natively at query time using `isIPAddressInRange()` — suppressing a /24 excludes all 256 addresses in that range without adding 256 individual entries.

### Scope

- **Global** — the suppression applies across all datasets. Use this for permanent known-good infrastructure.
- **Per-dataset** — the suppression only applies to the currently selected dataset. Use this when a value is legitimate in one network segment but suspicious in another.

### Expiry

All expiry options except Permanent set an absolute expiry date. Expired suppressions are automatically excluded at query time — they continue to appear in the Suppression List until manually deleted, but they do not filter data once expired.

### Show Suppressed toggle

When **Suppressed** is set to **Hide** (default), suppressed rows are excluded from all query results. When set to **Show**, suppressed rows appear in results highlighted with a red left border. This lets you audit what is being suppressed without removing the suppressions.

### Suppression List page

The Suppression List page shows all active entries. Features:

**Manual add** — An add form at the top accepts an IP, CIDR, or FQDN, along with type, scope, expiry, and reason. Press Enter or click Add.

**Excel bulk import** — Import a list from an `.xlsx` file. The file must have a single column with no header row — each row is one IP or FQDN. IPs imported via Excel are added as both Source IP and Destination IP entries. After import, a summary shows how many entries were added, skipped (duplicates), and invalid.

**Grouped display** — When the same IP/FQDN is suppressed as both src and dst, the table shows a single row with multiple type badges (Source IP and Dest IP displayed side by side). Click the **✕** on an individual badge to remove only that type without affecting the other.

**Multi-select bulk delete** — Check one or more rows using the checkboxes. A **Delete N selected** button appears. Clicking it opens a confirmation dialog that requires you to type the word `delete` before the deletion proceeds.

**Search** — A search box filters the list by value, scope, or reason text.

---

## 7. Score Reference

### Score columns

| Keyword | ClickHouse Column | What it Measures | When it's High |
|---|---|---|---|
| `threat` | `beacon_threat_score` | Composite overall threat score — combines periodicity, data size consistency, histogram shape, prevalence, first-seen recency, and other sub-scores. This is what the min/max score slider filters on. | The connection is broadly suspicious across multiple dimensions simultaneously |
| `beacon` | `beacon_score` | Periodicity and regularity of connection timing specifically | The connection fires on a very regular, clock-like schedule consistent with automated C2 check-in |
| `longconn` | `long_conn_score` | Duration of persistent outbound sessions | The connection stayed open for an unusually long time |
| `dns` | `c2_over_dns_score` | C2-over-DNS and DNS tunneling activity | The connection shows high query volume, large DNS responses, or subdomain enumeration patterns consistent with tunneling |
| `strobe` | `strobe_score` | High connection count to a single destination | The source made an unusually large number of individual connections to one host |
| `intel` | `threat_intel_score` | Match against known bad IPs/domains | The destination appears in a threat intelligence feed |

### Critical distinction: `threat` vs `beacon`

`threat` and `beacon` are different scores and both matter to analysts:

- **`beacon_threat_score` (threat)** is the composite score RITA assigns to the overall connection. It incorporates timing regularity, data size consistency, connection duration, histogram shape, prevalence across the network, and recency. It is the primary ranking score and what the score range slider filters on.

- **`beacon_score` (beacon)** measures specifically how regular and periodic the connection timing is — the pure C2 clock signal.

A connection can have high `beacon` (very regular timing) but a lower `threat` if it is prevalent across many hosts in the network (reducing its suspicion score) or has inconsistent data sizes (reducing other sub-scores).

A connection can have high `threat` but moderate `beacon` if multiple other dimensions (prevalence, first-seen, data size) are suspicious even though the timing is not perfectly regular.

**Rule of thumb:**
- To find pure C2 beaconing behavior — hosts calling home on a clock — use `beacon>75`
- To find all high-risk connections regardless of pattern — use `threat>75` or set the score slider above 75%

### Severity bands

The Score Distribution chart on the Dashboard uses these bands, which are based on `beacon_threat_score`:

| Band | Score range | Interpretation |
|---|---|---|
| Critical | ≥ 75% | High confidence suspicious activity — prioritize investigation |
| High | 50–74% | Elevated suspicion — warrants investigation |
| Medium | 25–49% | Moderate scoring — investigate if volume allows |
| Low | 1–24% | Low scoring — likely noise, but periodically audit |

---

## 8. Analyst Workflow Examples

### Example 1: I see a high beacon score — what do I do next?

**Scenario:** The Beaconing page loads and the top row shows an internal host with `beacon_score` at 92% and `beacon_threat_score` at 78%.

**Step 1 — Get the basic facts from Connection Details.**
Click anywhere in the row (not on the IP or FQDN text) to open the Connection Details panel. Note:
- The destination IP and FQDN
- The beacon type (IP or DNS)
- Protocol and ports
- Connection count and data volume
- First Seen Score — a brand-new connection scoring this high is more urgent
- The Beacon Intervals histogram — a narrow, consistent spike confirms automated timing

**Step 2 — Check for threat intel.**
Look at the TI Hit column in the row. If it shows YES, you have a confirmed-bad destination. If the TI section in Connection Details shows the feed name and indicator, use that for your intelligence report.

**Step 3 — Pivot to Investigate.**
Right-click the source IP text in the row and select **Pivot to Investigate**. This loads Investigate with only that host as the search target and resets the score filter, giving you every scored connection for that host across all categories.

**Step 4 — Read the category badges in Investigate results.**
Look at the Categories column. Does the host also have Long, DNS, or Strobe badges? A host beaconing AND strobing to the same destination suggests it may be running more than one C2 channel. A host beaconing AND with DNS activity to the same FQDN is a strong tunneling indicator.

**Step 5 — Exclude known-good.**
If you recognize some results as legitimate (an IT monitoring tool, a software update service), switch to AND mode in Investigate and add a NOT chip for the known-good destination:
```
NOT 203.0.113.5
```
This keeps your primary target chip active while removing the noise.

**Step 6 — Cross-check on other pages.**
Note the source IP. Navigate to Threat Intel and add it to the global filter to see if that host has any TI hits not captured in the Investigate view. Navigate to DNS Analysis and look for the same source — DNS tunneling and beaconing frequently co-occur.

---

### Example 2: I want to investigate a suspicious IP across all pages

**Scenario:** You have an IP address — either from an alert, a report, or manual observation — and want to understand its full picture in the dataset.

**Step 1 — Start on Investigate.**
Navigate to the Investigate page. Type the IP address in the chip input and press Enter. With no other chips, Investigate returns all scored connections where that IP is either the source or destination.

**Step 2 — Read the summary cards.**
The cards above the trend chart show the aggregate picture: max threat score, total connection count, total bytes, time range, TI hits. A high max score plus high connection count is a priority target.

**Step 3 — Read the category badges.**
Scan the Categories column. Multiple badge types on the same row (e.g., Beacon + TI + DNS) indicate a multi-vector threat. Use `beacon>0` in AND mode with the IP chip to isolate only the beaconing activity for that IP.

**Step 4 — Pivot from another page.**
If you first spotted the IP on the Beaconing page by clicking a connection that seemed suspicious, right-click the src or dst text on that row and select **Pivot to Investigate**. This loads Investigate pre-populated with that IP, saving you from typing it manually.

**Step 5 — Correlate with a second IP.**
If you suspect two internal hosts are communicating with the same C2 infrastructure, use AND mode with both IPs:
- Add the first IP chip
- Toggle to AND mode
- Add the second IP chip

AND mode requires both IPs to appear in the same row, which would indicate a shared src-dst pair. If you want to see all activity from either IP, stay in OR mode.

**Step 6 — Check prevalence.**
Open Connection Details for the highest-scoring row. The Prevalence section shows what percentage of hosts in the network communicated with the same destination. Low prevalence (e.g., 2%) to an external IP means this host is nearly alone in talking to it — a strong isolation indicator. High prevalence (e.g., 60%) suggests a shared service like a CDN or update server.

---

### Example 3: I want to exclude known-good traffic from my results

**Scenario:** The Beaconing page is dominated by rows you recognize — a monitoring agent, a cloud backup service, and a software telemetry endpoint. You want to tune them out without permanently suppressing them.

**Step 1 — Identify the values to exclude.**
Note the destination IPs or FQDNs of the known-good connections. For example:
- `203.0.113.10` (monitoring agent destination)
- `updates.vendor.com` (software update FQDN)

**Step 2 — Use NOT chips in Investigate for temporary, session-scoped filtering.**
Navigate to Investigate with no target chips (shows all results). Add NOT chips:
```
NOT 203.0.113.10
NOT updates.vendor.com
```
These exclusions apply only in this Investigate session and are cleared when you clear chips or type new targets. They do not affect the Beaconing or other pages.

**Step 3 — Use the chip filter bar for page-scoped filtering.**
Every detection page (Beaconing, Long Connections, DNS Analysis, Strobe Detection, Threat Intel) has a chip filter bar below the FilterBar that accepts the same NOT syntax. On the Beaconing page, add `!203.0.113.10` to exclude that destination from Beaconing results. Each page's chips persist in `localStorage` independently, so they survive page refreshes but only apply to that specific page.

**Step 4 — Use suppression for permanent, dataset-wide exclusion.**
When you have confirmed a value is legitimate and want to exclude it everywhere, permanently:
1. Right-click the src/dst/fqdn value on any page
2. Select **Suppress: [value]**
3. Set scope to **Global** if it applies across all datasets
4. Set expiry to **1 year** or **Permanent**
5. Add a reason (e.g., "Known monitoring agent — IT confirmed")

Once suppressed and **Show Suppressed** is set to Hide, that value disappears from all pages across all categories.

**The key difference:**

| Method | Scope | Persistence | Affects other pages |
|---|---|---|---|
| NOT chip in Investigate | Investigate session only | Until chip is removed | No |
| Chip filter bar (any detection page) | That page only | Persists in localStorage | No |
| Suppression | All pages (global) or one dataset | Until expiry | Yes |

Use NOT chips when you are in the middle of an investigation and want to tune noise temporarily. Use suppression when you have finished investigating and confirmed the traffic is legitimate.
