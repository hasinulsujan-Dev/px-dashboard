#!/usr/bin/env python3
"""
Export every employee's current (latest-synced) team/department from data.js.

BioTime's employee directory has no historical dimension — it only ever reports
each person's CURRENT department — so this is a point-in-time reference snapshot,
useful for cross-checking against HR records when deciding what to enter on the
dashboard's Team Switch page (Data Editor group) for anyone who changed teams
mid-year.

Usage:
  python3 export-current-teams.py                    # writes current-teams.csv
  python3 export-current-teams.py --out roster.csv
  python3 export-current-teams.py --data data.js
"""
import argparse
import csv
import json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data.js")
    ap.add_argument("--out", default="current-teams.csv")
    args = ap.parse_args()

    with open(args.data) as f:
        content = f.read()
    json_str = content.split("=", 1)[1].strip()
    if json_str.endswith(";"):
        json_str = json_str[:-1]
    data = json.loads(json_str)

    rows = sorted(
        (
            {"name": p.get("name", ""), "id": eid, "team": p.get("team", ""), "perks": p.get("perks", "")}
            for eid, p in data.get("profiles", {}).items()
        ),
        key=lambda r: r["name"].lower(),
    )

    with open(args.out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "id", "team", "perks"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} employees to {args.out}")


if __name__ == "__main__":
    main()
