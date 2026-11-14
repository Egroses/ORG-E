"""Development server for `GET /api/patch` (contract: docs/patch-api.md). Standard library only.

    python -m imaging.dev_server --cache E:\\nasa\\ORG-E\\cache --port 8000 [--prebuild]

It serves the five cached test targets so the frontend can run against real data locally, and it is
the REFERENCE for the backend developer: parameter handling, job id, background build with
progress, 202 while building / 200 when done, error codes, CORS and the in-memory result cache.
Not for production (no auth, no limits, results are lost on restart, positions are matched against
the five cached targets only).
AI-assisted code (Claude Code).
"""

import argparse
import gzip
import hashlib
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import encode_patch, make_patch
from .records import load_records_by_detector

# Targets cached by the pipeline (pipeline/targets.json), position at epoch 2026.0.
TARGETS = {
    "barnard": (269.446271, 4.768197),
    "epsindb": (331.096658, -56.800657),
    "wise0855": (133.759871, -7.242252),
    "rwaur": (76.956590, 30.401293),
    "rdra": (248.167233, 66.755024),
}
SNAP_DEG = 1e-3          # a request this close to a cached target uses that target's cache
CUTOUT_DEG = 0.1         # size of the cached cutouts
FOV_RANGE = (0.05, 0.25)


class BadRequest(ValueError):
    pass


def parse_params(query):
    """Validate a query string (dict of lists) and return normalised parameters."""
    def number(name, default=None):
        values = query.get(name)
        if not values:
            if default is None:
                raise BadRequest(f"missing parameter '{name}'")
            return default
        try:
            return float(values[0])
        except ValueError:
            raise BadRequest(f"'{name}' must be a number")

    ra, dec = number("ra"), number("dec")
    fov = number("fov", 0.1)
    if not FOV_RANGE[0] <= fov <= FOV_RANGE[1]:
        raise BadRequest(f"'fov' must be between {FOV_RANGE[0]} and {FOV_RANGE[1]} degrees")
    if not (0 <= ra < 360 and -90 <= dec <= 90):
        raise BadRequest("ra/dec out of range")
    try:
        dets = sorted({int(d) for d in query.get("dets", ["2,4,6"])[0].split(",") if d.strip()})
    except ValueError:
        raise BadRequest("'dets' must be a comma list of integers")
    if not dets or len(dets) > 6 or any(d < 1 or d > 6 for d in dets):
        raise BadRequest("'dets' must list 1 to 6 detectors numbered 1-6")
    gap, span = number("gap_days", 10.0), number("max_span_days", 30.0)
    if gap <= 0 or span <= 0:
        raise BadRequest("'gap_days' and 'max_span_days' must be positive")
    return {"ra": ra, "dec": dec, "fov": fov, "dets": dets, "gap_days": gap, "max_span_days": span}


def job_id(params):
    """Same parameters, same id (12 hex characters)."""
    text = json.dumps(params, sort_keys=True)
    return hashlib.sha1(text.encode()).hexdigest()[:12]


def find_target(ra, dec):
    for key, (t_ra, t_dec) in TARGETS.items():
        if abs(ra - t_ra) < SNAP_DEG and abs(dec - t_dec) < SNAP_DEG:
            return key
    return None


class Jobs:
    """In-memory job table: one background thread per new job, results kept for the process lifetime."""

    def __init__(self, cache_dir):
        self.cache_dir = Path(cache_dir)
        self.lock = threading.Lock()
        self.jobs = {}      # id -> {"status", "progress", "body" (bytes) | "error"}

    def submit(self, params):
        """Return the job id; start the build unless that job already exists."""
        jid = job_id(params)
        with self.lock:
            if jid not in self.jobs:
                self.jobs[jid] = {"status": "queued", "progress": {"total": 0, "done": 0, "failed": 0}}
                threading.Thread(target=self._run, args=(jid, params), daemon=True).start()
        return jid

    def _fail(self, jid, code, message):
        with self.lock:
            self.jobs[jid].update(status="failed", error={"code": code, "message": message})

    def _run(self, jid, params):
        target = find_target(params["ra"], params["dec"])
        if target is None:
            return self._fail(jid, "no_coverage", "This development server only has the five cached test "
                              "targets; use the 2026.0 position from pipeline/targets.json.")
        records = load_records_by_detector(self.cache_dir, target, params["dets"])
        total = sum(len(v) for v in records.values())
        if total == 0:
            return self._fail(jid, "no_coverage", "No cached exposures for these detectors.")

        def progress(done, total_, failed):
            with self.lock:
                self.jobs[jid]["progress"] = {"total": total_, "done": done, "failed": failed}

        with self.lock:
            self.jobs[jid].update(status="running", progress={"total": total, "done": 0, "failed": 0})
        try:
            patch = make_patch(records, params["ra"], params["dec"], params["fov"], params["gap_days"],
                               params["max_span_days"], progress=progress)
            if not patch.epochs:
                return self._fail(jid, "no_coverage", "No readable exposures at this position.")
            if params["fov"] > CUTOUT_DEG:
                patch.warnings.append(f"The cached cutouts are {CUTOUT_DEG} deg wide; the edges of this larger "
                                      "field have no data (NaN).")
            payload = encode_patch(patch, jid)
        except Exception as exc:  # report, never crash the thread silently
            return self._fail(jid, "internal_error", f"Could not build the patch: {exc}")
        body = json.dumps(payload, separators=(",", ":")).encode()
        with self.lock:
            self.jobs[jid].update(status="done", body=body, body_gzip=gzip.compress(body, 3))

    def snapshot(self, jid):
        with self.lock:
            return dict(self.jobs[jid])


def make_handler(jobs):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, code, body, gzipped=False):
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            if gzipped:
                self.send_header("Content-Encoding", "gzip")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, code, obj):
            self._send(code, json.dumps(obj).encode())

        def do_OPTIONS(self):  # CORS preflight
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.end_headers()

        def do_GET(self):
            url = urlparse(self.path)
            if url.path == "/api/health":
                return self._json(200, {"status": "ok"})
            if url.path != "/api/patch":
                return self._json(404, {"status": "failed", "error": {"code": "not_found", "message": "unknown route"}})
            try:
                params = parse_params(parse_qs(url.query))
            except BadRequest as exc:
                return self._json(400, {"status": "failed", "error": {"code": "bad_input", "message": str(exc)}})
            jid = jobs.submit(params)
            job = jobs.snapshot(jid)
            if job["status"] in ("queued", "running"):
                return self._json(202, {"status": job["status"], "id": jid, "progress": job["progress"]})
            if job["status"] == "failed":
                return self._json(200, {"status": "failed", "id": jid, "error": job["error"]})
            if "gzip" in self.headers.get("Accept-Encoding", ""):
                return self._send(200, job["body_gzip"], gzipped=True)
            return self._send(200, job["body"])

        def log_message(self, fmt, *args):
            print(f"{self.address_string()} {fmt % args}")

    return Handler


def prebuild(jobs):
    """Warm the in-memory cache with the default request of every cached target."""
    for ra, dec in TARGETS.values():
        jobs.submit(parse_params({"ra": [str(ra)], "dec": [str(dec)]}))


def main(argv=None):
    parser = argparse.ArgumentParser(description="Development server for GET /api/patch")
    parser.add_argument("--cache", required=True, help="cache folder (cache/<target>/D<det>/manifest.csv)")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--prebuild", action="store_true", help="build the five test targets at start-up")
    args = parser.parse_args(argv)
    jobs = Jobs(args.cache)
    if args.prebuild:
        prebuild(jobs)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(jobs))
    print(f"imaging dev server on http://{args.host}:{args.port}  (cache {args.cache})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
