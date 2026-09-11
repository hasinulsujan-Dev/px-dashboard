#!/usr/bin/env python3
"""Local dev server for the PX dashboard.

Serves the project directory exactly like `python3 -m http.server`, plus one
JSON endpoint the dashboard's "zkteco-api sync" button calls before reloading
data.js:

  POST /api/sync-now  -> re-fetches *today's* month from the ZKTeco BioTime API
                          (see fetch-zkteco-snapshot.py:sync_current_month) and
                          merges it into data.js, leaving every other month
                          untouched. This is what makes the sync button show
                          today's punches instead of yesterday's snapshot.

Everything else about serving files is unchanged from the plain static server.
BioTime credentials still come from the gitignored .env in the project root,
same as running fetch-zkteco-snapshot.py by hand.

Usage:
  python3 serve.py [port]   # defaults to 8934, matching .claude/launch.json
"""
import functools
import http.server
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

spec = importlib.util.spec_from_file_location("zkteco_snapshot", ROOT / "fetch-zkteco-snapshot.py")
zkteco_snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(zkteco_snapshot)


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self._is_blocked():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if self._is_blocked():
            self.send_error(404)
            return
        super().do_HEAD()

    def _is_blocked(self):
        # Never serve dotfiles (e.g. .env, which holds BIOTIME_PASSWORD in cleartext) —
        # SimpleHTTPRequestHandler has no such filter on its own.
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        return any(part.startswith(".") for part in path.split("/") if part)

    def do_POST(self):
        if self.path == "/api/sync-now":
            self._sync_now()
        else:
            self.send_error(404)

    def _sync_now(self):
        try:
            month, count = zkteco_snapshot.sync_current_month(
                env_path=str(ROOT / ".env"), out_path=str(ROOT / "data.js"), log=print
            )
            status, body = 200, {"ok": True, "month": month, "employees": count}
        except Exception as e:
            status, body = 502, {"ok": False, "error": str(e)}
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8934
    handler = functools.partial(Handler, directory=str(ROOT))
    # Loopback-only: this is a local dev server holding BioTime credentials server-side
    # (see .env) — it has no business being reachable from other machines on the LAN.
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Serving {ROOT} on port {port} (POST /api/sync-now for live ZKTeco refresh)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
