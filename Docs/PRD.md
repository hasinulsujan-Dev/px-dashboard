# PX Team Dashboard-2026 — Product Requirements Document

> **Conventions — YEAR** · Every user-facing label includes the year suffix **`-YYYY`** (e.g. `Jan-2026`). The sidebar hosts **PX Team Dashboard-2026** (current page, live data from the 2026 sheets) and **PX Team Dashboard-2027** right below it (next-phase stub, separate `?year=2027` page; Phase 2 will source its data from `Sample of Attendance-2027` / `Sailor's Report-2027` sheets).

## 1. Overview

A team dashboard titled **"PX Team Dashboard-2026"** (2026 scope; 2027 will live on its own **`PX Team Dashboard-2027`** page next phase) with separate areas for different data and reports:

- **Section 1 — Attendance Report**: monthly metrics for **2026** computed from Google Sheet *"Sample of Attendance-2026"* (https://docs.google.com/spreadsheets/d/1i5NrueAeZLEE4blFuX6D5Hdb6wAVuomI8zxYKLnpC5Y/edit?gid=782354685#gid=782354685) — year page **PX Team Dashboard-2026**.
- **Section 2 — Sailor's Report**: monthly compliance report for **2026** following the criteria defined in Google Sheet *"Sailor's Report-2026 with Sample Data"* (https://docs.google.com/spreadsheets/d/1ItMz3DMVH9U2GkY5j_XOLssonrkO-VoQhqVUN49fWPU/edit?gid=1979001742#gid=1979001742) — same `-2026` year scope.
- **Manual Data Entry**: both reports fully editable from within the dashboard (scoped to the `-2026` data for this phase).
- **Year pages**: sidebar hosts **PX Team Dashboard-2026** (current, active) and **PX Team Dashboard-2027** (stub, Phase 2). Switching years changes the title/header to the matching `-YYYY` and, in Phase 2, will switch the backing sheets to the 2027 variants.

## 2. Data Sources

| Source | Type | Used For | Tabs Considered |
|---|---|---|---|
| Sample of Attendance-2026 | Google Sheet | Attendance calculations | Only tabs containing "Attendance 2026"; tabs named "Raw Data" are ignored |
| Sailor's Report-2026 with Sample Data | Google Sheet | Criteria definitions & report format | Monthly tabs (format taken from "Jun-2026") |

### 2.1 Standard columns extracted (Attendance)

From each "… Attendance 2026" tab (standard structure per **"July Attendance 2026"**):

| Column | Notes |
|---|---|
| Employee ID | Unique key per person |
| Name | Employee name |
| Perks | e.g., Public Transport / Exavehicle / Exanest A4 / Remote |
| Department/Team | e.g., bKash / Exabyting Office / Exabyting Remote / Support Staff |
| Date | Attendance date |
| Weekdays | Weekday/Weekend marker |
| Clock In | Check-in time |
| Clock Out | Check-out time |

All other columns in the sheet are ignored; every derived value is calculated by the dashboard itself.

## 3. Section 1 — Attendance Calculations

### 3.1 Daily Status rules

A `Status` is derived for each row:

| Rule | Status |
|---|---|
| Clock In after 10:00 AM | **Late** |
| Clock In at or before 10:00 AM | **On Time** |
| Clock In and Clock Out both blank | **Absent** |

### 3.2 Worked hours

- `Office Hours` = Clock Out − Clock In (only when both are present).
- Weekends: **Friday & Saturday** are the official weekend.
- Weekend rows are excluded from all attendance metrics (Absent, Late, <8h days, early check-out, averages). They remain visible in raw drill-downs.

### 3.3 Per-employee/day columns — 14 sequential columns (left to right)

The daily attendance table for each month displays **all 14 columns** in exactly this order (no hidden columns; empty cells shown as —). Month labels in the filter and panel headers render as **short-form `Mon-YYYY`** (e.g. `Jan-2026` … `Dec-2026`) for the `PX Team Dashboard-2026` year page; canonical month keys remain `January` … `December` for sheet/tab logic (`MONTH_GVIZ`, `DATA.daily`, `MATRIX`).

| # | Column | Description |
|---|--------|-------------|
| 1 | Employee ID | Unique key |
| 2 | Name | Employee name |
| 3 | Perks | e.g. Public Transport / Exavehicle / Exanest A4 |
| 4 | Department/Team | e.g. bKash / Exabyting Office / Support Staff |
| 5 | Date | YYYY-MM-DD |
| 6 | Weekdays | Weekday / Weekend marker from the sheet |
| 7 | Clock In | H:MM (or —) |
| 8 | Clock Out | H:MM (or —) |
| 9 | Status | **Late** (after 10:00), **On Time** (≤10:00), **Absent** (both blank) |
| 10 | Early checkout? | **Yes** (Clock Out before 19:00) / **No** / — |
| 11 | Work Time per day | Duration `HH:MM` per attended day (or —) |
| 12 | Average Daily Office Hours (Less than 8 hours) | Column header stays only — populated at employee level in summary |
| 13 | Average Daily Office Hours (Less than 9 hours) | Same as above |
| 14 | Average Daily Office Hours (More than 9 hours) | Same as above |

All derived values (9–14) are computed by the dashboard per *3.1/3.2*; columns 12–14 exist for every month even when empty. The per-month view keeps the day-by-day rows (one row per person per day) — not a pre-aggregated summary — so filters (3.5) operate on the full action-level detail.

### 3.4 Month handling

- Attendance section is tabbed per month: **January through December**, one tab per month, each displaying its full daily table (Jan–Dec sequential; each tab shows its month's complete 14-column table described in 3.3) **labeled as `Jan-2026` … `Dec-2026` in the `PX Team Dashboard-2026` page's filter**. The month tabs are placed inside the Attendance section — no separate per-month table list outside it.
- Any new month tab added to the sheet must automatically appear as a new month view with identical calculations.

### 3.5 Filters

Global filter bar over the attendance section:

- Month (single or multi-select) and date-range within/across months
- Employee (Name / Employee ID)
- Department/Team, Perks, Status

Selecting an employee opens a detail popup with their daily rows and month-over-month summary.

## 4. Section 2 — Sailor's Report

### 4.1 Format

Follow the **"Jun-2026"** tab layout of *Sailor's Report-2026 with Sample Data*: the 21 criteria listed under the Name column, each with its Responsibility tag.

### 4.2 Criteria (21)

Responsibility tags: PX, PX (Only onsite employees), PX (Only onsite), Accounts, Accounts + PX + Project, Project Team.

1. Enjoyed Late / Unrequested Meal (> 3 times) — PX
2. Double lunch booking (bKash & Exabyting) — PX
3. Late Check-in Count (> 3 times) (Only onsite employees) — auto from attendance (Days Late)
4. Partial Attendance Count (> 3 times) (< 8 hours) (Only onsite employees) — auto from attendance (Days < 8 Hours)
5. Early Check Out (> 3 times) (Only onsite employees) — auto from attendance (Early Check-Out Days)
6. Average Daily Office Hours (Only onsite employees) (Only < 9 hours) — auto from attendance
7. Average Daily Office Hours (Only onsite employees) (Only > 9 hours) — auto from attendance
8. Home Office Count (Only onsite employees) (> 2 times) — PX
9. Transport allowance (Misuse description, if any) — PX
10. Dormitory low utilization (< 80%) — PX
11. ExaNest Misuse — PX
12. Transport Utilization (Only include people < 80%) — PX
13. Non-Cooperative Behaviour (if any) — Accounts, PX, Project
14. Leave Count mismatch with Aladin against fingerprint device (Count) (Non bKash) — PX (Only onsite)
15. Leave Count mismatch with Aladin against bKash Timecard (Count) (Only bKash) — Accounts, PX
16. Extra Working days Count (> 2 / Month) — Accounts
17. Recharge (Misuse description, if any) — Accounts
18. IT incentive (Misuse description, if any) — Accounts
19. Health (Misuse description, if any) — Accounts
20. Interview cancellation (> 20% months) — Project Team
21. KPI flag from bKash (Description) — Project Team

Criteria #3–7 are auto-computed from the attendance section; the rest support manual entry.

### 4.3 Onsite vs remote

"Onsite employees" means people who work from office (vs remote workers). The exact roster rule will be refined later if issues arise; initially treat non-"Remote" perks/departments as onsite. This affects view filtering only.

### 4.4 Monthly generation

- Each month mirrors the Jun-2026 format.
- Whenever a new month tab is added to either source sheet, the corresponding report is generated/refreshed automatically.

## 5. Manual Data Entry Database

- Both reports are fully editable from the dashboard UI:
  - Attendance-derived values can be overridden/corrected manually.
  - Sailor's Report values (counts, names, descriptions) can be entered manually per month/criterion.
- Manual entries take precedence over sheet-synced values and are clearly marked as edited.

## 6. Live Sync & Offline Fallback

- **Data source**: Google Sheets via gviz JSONP (CORS-free; works from a local `file://` or hosted server without API keys, provided both sheets remain link-viewable).
- **Auto-sync on load**: the dashboard probes `MONTH_GVIZ` tabs (Jan–Dec Attendance 2026) in parallel via gviz, parses headers with `rowsToRecords`, computes statuses/hours/aggregates client-side, and auto-discovers newly published month tabs per requirement 3.4 (e.g., the live sheet now exposes August and December 2026, which the dashboard picked up automatically).
- **Offline fallback**: an embedded snapshot is baked into `index.html`; if gviz probes fail, the pill shows `● offline` and the snapshot is used.
- **Sailor's Report sync**: fetched live after attendance tabs; entries come from the Sailor sheet's month tabs (`SAIL_TABS`), overriding auto-computed ones.
- **Status indicator**: pill in the header header (`● syncing…` → `● live` / `● offline`).

## 7. Non-Functional Requirements

- Modern, clean dashboard UI (dark-mode friendly, card/table based, responsive).
- Filters apply across tables; results render in popups/detail views where appropriate.
- No login required for v1 (internal tool).
