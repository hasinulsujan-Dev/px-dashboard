#!/usr/bin/env python3
"""
Fetch attendance data from the ZKTeco BioTime API and regenerate data.js with the
same months/employees/daily/profiles shape the dashboard already expects (matching
computeRows()/aggregateRows() in px-dashboard.template.html), so all existing
calculations (Attended/Absent/Late/On-time, Sailor's Report criteria, etc.) work
unchanged against this new data source.

Field mapping (per explicit instruction): BioTime's "nickname" -> our "Perks" column.

This is a periodic-snapshot fetcher, not a live sync: run it whenever you want to
refresh the embedded data.js (e.g. monthly), then reload the dashboard. It only
replaces the Attendance-derived keys (months/employees/daily/profiles) and leaves
sailors/sailorCriteria/sailorManual (from the separate Sailor's Report sheet) untouched.

Usage:
  python3 fetch-zkteco-snapshot.py
  python3 fetch-zkteco-snapshot.py --months January,February,March
  python3 fetch-zkteco-snapshot.py --env .env --out data.js

Reads BIOTIME_BASE_URL / BIOTIME_USERNAME / BIOTIME_PASSWORD from .env
in the project root by default (gitignored).
"""
import argparse
import calendar
import json
import sys
from datetime import date
from urllib import request, parse

MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]
YEAR = 2026


def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def http_json(url, method="GET", data=None, headers=None, timeout=30):
    headers = dict(headers or {})
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        headers["Content-Type"] = "application/json"
    req = request.Request(url, data=body, method=method, headers=headers)
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def authenticate(base_url, username, password):
    d = http_json(f"{base_url}/api-token-auth/", method="POST",
                   data={"username": username, "password": password})
    return d["token"]


def fetch_all(base_url, path, token, params=None, page_size=2000):
    items = []
    qp = dict(params or {})
    qp["page_size"] = page_size
    url = f"{base_url}{path}?{parse.urlencode(qp)}"
    page = 0
    while url:
        page += 1
        d = http_json(url, headers={"Authorization": f"Token {token}"}, timeout=60)
        batch = d.get("data") or d.get("results") or []
        items.extend(batch)
        print(f"    page {page}: +{len(batch)} (total {len(items)} / {d.get('count', '?')})", flush=True)
        url = d.get("next")
    return items


def fetch_employee_directory(base_url, token):
    print("[1/3] Fetching employee directory...", flush=True)
    emps = fetch_all(base_url, "/personnel/api/employees/", token)
    out = {}
    for e in emps:
        emp_code = str(e.get("emp_code") or e.get("id") or "").strip()
        if not emp_code:
            continue
        dept = e.get("department")
        if isinstance(dept, dict):
            dept = dept.get("dept_name") or dept.get("name") or ""
        out[emp_code] = {
            "id": (e.get("last_name") or "").strip() or emp_code,
            "name": (e.get("first_name") or "").strip(),
            "perks": (e.get("nickname") or "").strip(),  # nickname -> Perks
            "team": (dept or "").strip(),
            "hire_date": (e.get("hire_date") or "").strip() or None,
        }
    print(f"    -> {len(out)} employees", flush=True)
    return out


def parse_time_to_minutes(hms):
    parts = hms.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def fetch_month_transactions(base_url, token, year, month_num):
    days_in_month = calendar.monthrange(year, month_num)[1]
    start = f"{year:04d}-{month_num:02d}-01 00:00:00"
    end = f"{year:04d}-{month_num:02d}-{days_in_month:02d} 23:59:59"
    return fetch_all(base_url, "/iclock/api/transactions/", token,
                      {"start_time": start, "end_time": end})


def build_month_data(year, month_num, transactions, emp_directory):
    days_in_month = calendar.monthrange(year, month_num)[1]
    month_last_day = date(year, month_num, days_in_month).isoformat()

    grouped = {}
    for r in transactions:
        emp_code = str(r.get("emp_code") or r.get("emp") or "").strip()
        punch = r.get("punch_time")
        if not emp_code or not punch:
            continue
        d = punch[:10]
        grouped.setdefault(emp_code, {}).setdefault(d, []).append(punch[11:19])

    daily_rows = []
    employees_agg = []

    for emp_code, profile in emp_directory.items():
        hire_date = profile.get("hire_date")
        if hire_date and hire_date > month_last_day:
            continue  # not yet hired as of this month

        emp_id = profile["id"]
        punches_by_date = grouped.get(emp_code, {})
        days = []
        for day in range(1, days_in_month + 1):
            d = date(year, month_num, day)
            date_key = d.isoformat()
            times = sorted(punches_by_date.get(date_key, []))
            cin = parse_time_to_minutes(times[0]) if times else None
            cout = parse_time_to_minutes(times[-1]) if len(times) > 1 else None
            has_any = cin is not None or cout is not None

            if not has_any:
                status = "Absent"
            elif cin is not None:
                status = "Late" if cin > 600 else "On Time"
            else:
                status = "Late"

            hours = None
            if cin is not None and cout is not None:
                m2 = cout - cin
                if m2 < 0:
                    m2 += 1440
                hours = round(m2 / 60, 2)

            js_dow = (d.weekday() + 1) % 7  # Python Mon=0..Sun=6 -> JS Sun=0..Sat=6
            is_weekday = js_dow != 5 and js_dow != 6  # Fri/Sat weekend

            days.append({
                "weekday": is_weekday,
                "attended": has_any,
                "late": status == "Late",
                "below8": hours is not None and hours < 8,
                "earlyOut": cout is not None and cout < 19 * 60,
                "hours": hours,
            })
            daily_rows.append([emp_id, f"{month_num}/{day}", cin, cout, status])

        wd_days = [x for x in days if x["weekday"]]
        att_days = [x for x in wd_days if x["attended"]]
        wd = len(wd_days)
        att = len(att_days)
        absent = wd - att
        late = sum(1 for x in att_days if x["late"])
        b8 = sum(1 for x in att_days if x["below8"])
        eco = sum(1 for x in att_days if x["earlyOut"])
        hrs = [x["hours"] for x in att_days if x["hours"] is not None]
        avg = round(sum(hrs) / len(hrs), 2) if hrs else None
        band = "" if avg is None else ("<9" if avg < 9 else ">9")

        employees_agg.append({
            "id": emp_id, "name": profile["name"], "perks": profile["perks"],
            "team": profile["team"], "att": att, "wd": wd, "absent": absent,
            "late": late, "b8": b8, "eco": eco, "avg": avg, "band": band,
        })

    employees_agg.sort(key=lambda e: e["name"])
    return daily_rows, employees_agg


def sync_current_month(env_path=".env", out_path="data.js", today=None, log=lambda *a: None):
    """Refetch just today's month from BioTime and merge it into the existing data.js,
    leaving every other month untouched. This is what the dashboard's "zkteco-api sync"
    button triggers (via serve.py's /api/sync-now) to show today's punches instead of
    waiting for the next full periodic run of main()."""
    today = today or date.today()
    month_name = MONTH_NAMES[today.month - 1]

    env = load_env(env_path)
    base_url = env["BIOTIME_BASE_URL"].rstrip("/")
    username = env["BIOTIME_USERNAME"]
    password = env["BIOTIME_PASSWORD"]

    log(f"Authenticating with {base_url} ...")
    token = authenticate(base_url, username, password)
    emp_directory = fetch_employee_directory(base_url, token)

    log(f"Fetching transactions for {month_name} {today.year}...")
    txns = fetch_month_transactions(base_url, token, today.year, today.month)
    daily_rows, employees_agg = build_month_data(today.year, today.month, txns, emp_directory)

    profiles = {}
    for emp_code, p in emp_directory.items():
        profiles[p["id"]] = {"name": p["name"], "perks": p["perks"], "team": p["team"]}

    with open(out_path) as f:
        old_content = f.read()
    old_json_str = old_content.split("=", 1)[1].strip()
    if old_json_str.endswith(";"):
        old_json_str = old_json_str[:-1]
    data = json.loads(old_json_str)

    if month_name not in data.get("months", []):
        data.setdefault("months", []).append(month_name)
    data.setdefault("employees", {})[month_name] = employees_agg
    data.setdefault("daily", {})[month_name] = daily_rows
    data["profiles"] = profiles

    with open(out_path, "w") as f:
        f.write("const DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")

    bump_data_js_cache_version()
    return month_name, len(employees_agg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", default=".env")
    ap.add_argument("--out", default="data.js")
    ap.add_argument("--months", default=",".join(MONTH_NAMES[:9]))
    args = ap.parse_args()

    env = load_env(args.env)
    base_url = env["BIOTIME_BASE_URL"].rstrip("/")
    username = env["BIOTIME_USERNAME"]
    password = env["BIOTIME_PASSWORD"]

    months = [m.strip() for m in args.months.split(",") if m.strip()]
    month_nums = [MONTH_NAMES.index(m) + 1 for m in months]

    print(f"Authenticating with {base_url} ...", flush=True)
    token = authenticate(base_url, username, password)
    print("OK", flush=True)

    emp_directory = fetch_employee_directory(base_url, token)

    all_daily = {}
    all_employees = {}
    for i, (m, mnum) in enumerate(zip(months, month_nums), 1):
        print(f"[2/3] ({i}/{len(months)}) Fetching transactions for {m} {YEAR}...", flush=True)
        txns = fetch_month_transactions(base_url, token, YEAR, mnum)
        print(f"    -> {len(txns)} raw punches", flush=True)
        daily_rows, employees_agg = build_month_data(YEAR, mnum, txns, emp_directory)
        all_daily[m] = daily_rows
        all_employees[m] = employees_agg
        print(f"    -> {len(employees_agg)} employees with data in {m}", flush=True)

    profiles = {}
    for emp_code, p in emp_directory.items():
        profiles[p["id"]] = {"name": p["name"], "perks": p["perks"], "team": p["team"]}

    print("[3/3] Merging into data.js (preserving sailors/sailorCriteria/sailorManual)...", flush=True)
    with open(args.out) as f:
        old_content = f.read()
    old_json_str = old_content.split("=", 1)[1].strip()
    if old_json_str.endswith(";"):
        old_json_str = old_json_str[:-1]
    old_data = json.loads(old_json_str)

    new_data = {
        "months": months,
        "employees": all_employees,
        "sailors": old_data.get("sailors", {}),
        "daily": all_daily,
        "profiles": profiles,
        "sailorCriteria": old_data.get("sailorCriteria", []),
        "sailorManual": old_data.get("sailorManual", {}),
    }

    with open(args.out, "w") as f:
        f.write("const DATA = " + json.dumps(new_data, separators=(",", ":")) + ";\n")

    bump_data_js_cache_version()

    print(f"Done. Wrote {args.out} with {len(months)} months, {len(profiles)} profiles.", flush=True)


def bump_data_js_cache_version():
    """Bump the ?v= query on <script src="data.js?v=N"> in both the template and index.html,
    so browsers that already cached the old data.js are forced to fetch the fresh one instead
    of silently showing stale months (this bit us once already — don't rely on manual hard
    refreshes to fix it)."""
    import re
    import time
    version = str(int(time.time()))
    for path in ("px-dashboard.template.html", "index.html"):
        try:
            with open(path) as f:
                content = f.read()
        except FileNotFoundError:
            continue
        new_content, n = re.subn(r'(<script src="data\.js)(?:\?v=\d+)?(")', rf'\g<1>?v={version}\g<2>', content)
        if n:
            with open(path, "w") as f:
                f.write(new_content)
            print(f"    bumped data.js cache version -> {version} in {path}", flush=True)


if __name__ == "__main__":
    main()
