#!/bin/sh
# px-dashboard.template.html is the single source of truth for the dashboard's
# markup/CSS/JS. Both it and index.html load the same external data.js, so
# after editing the template, run this to copy it over index.html and keep
# the two in sync (no more hand-duplicating edits across both files).
set -e
cd "$(dirname "$0")"
cp px-dashboard.template.html index.html
echo "index.html synced from px-dashboard.template.html"
