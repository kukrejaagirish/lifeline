#!/usr/bin/env python3
"""
Life-Line server test suite — standard library only, matching the project's
zero-dependency philosophy.

Boots the real server.py as a subprocess against a throwaway copy of the
repo (so it never touches your real data/lifeline.db), then drives it
purely over HTTP the same way a browser or curl would. This exercises the
actual code paths (auth, locking, SQLite writes, routing) rather than
mocking anything internal.

Run from the repo root:
    python3 tests/test_server.py
    python3 -m unittest tests.test_server -v

Exit code is 0 on success, non-zero on any failure — safe to wire into a
pre-push hook or CI step.
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_SRC = os.path.join(REPO_ROOT, "server.py")
PUBLIC_SRC = os.path.join(REPO_ROOT, "public")


def free_port():
    """Ask the OS for an unused port so parallel test runs don't collide."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class LiveServer:
    """Spins up an isolated copy of the app in a temp dir and tears it
    down afterwards. Isolated = your real data/lifeline.db is never
    touched, no matter what the tests do to it."""

    def __init__(self, rate_limit=None, auth_required=False, bootstrap=None):
        self.auth_required = auth_required
        self.bootstrap = bootstrap
        self.tmpdir = tempfile.mkdtemp(prefix="lifeline-test-")
        shutil.copy2(SERVER_SRC, os.path.join(self.tmpdir, "server.py"))
        shutil.copytree(PUBLIC_SRC, os.path.join(self.tmpdir, "public"))
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        env = dict(os.environ)
        if rate_limit is not None:
            env["LIFELINE_RATE_LIMIT"] = str(rate_limit)
        env["LIFELINE_AUTH_REQUIRED"] = "1" if auth_required else "0"
        if bootstrap:
            env["LIFELINE_BOOTSTRAP_ADMIN_ID"] = bootstrap[0]
            env["LIFELINE_BOOTSTRAP_ADMIN_PASSWORD"] = bootstrap[1]
        self.proc = subprocess.Popen(
            [sys.executable, "server.py", "--port", str(self.port),
             "--fresh", "--no-sim"],
            cwd=self.tmpdir, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True)
        self._wait_ready()

    def _wait_ready(self, timeout=10):
        deadline = time.time() + timeout
        last_err = None
        while time.time() < deadline:
            if self.proc.poll() is not None:
                out = self.proc.stdout.read() if self.proc.stdout else ""
                raise RuntimeError(
                    f"server exited early (code {self.proc.returncode}):\n{out}")
            try:
                with urllib.request.urlopen(f"{self.base}/api/health",
                                            timeout=1) as r:
                    if r.status == 200:
                        return
            except (urllib.error.URLError, ConnectionError) as e:
                last_err = e
                time.sleep(0.15)
        raise RuntimeError(f"server never became ready: {last_err}")

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait(timeout=5)
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def restart(self):
        """Stop the server process but keep its SQLite DB, then boot a
        fresh process against the same data dir (no --fresh). Used to
        test that state survives a restart correctly."""
        self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait(timeout=5)
        if self.proc.stdout:
            self.proc.stdout.close()
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        env = dict(os.environ)
        env["LIFELINE_AUTH_REQUIRED"] = "1" if self.auth_required else "0"
        if self.bootstrap:
            env["LIFELINE_BOOTSTRAP_ADMIN_ID"] = self.bootstrap[0]
            env["LIFELINE_BOOTSTRAP_ADMIN_PASSWORD"] = self.bootstrap[1]
        self.proc = subprocess.Popen(
            [sys.executable, "server.py", "--port", str(self.port),
             "--no-sim"],
            cwd=self.tmpdir, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True)
        self._wait_ready()

    # ---- HTTP helpers ----
    def request(self, method, path, token=None, body=None, raw_path=False):
        url = self.base + path if raw_path else self.base + path
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                raw = r.read().decode("utf-8", errors="replace")
                ctype = r.headers.get("Content-Type", "")
                if "application/json" in ctype:
                    return r.status, json.loads(raw)
                return r.status, raw
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            try:
                return e.code, json.loads(raw)
            except json.JSONDecodeError:
                return e.code, raw

    def get(self, path, token=None):
        return self.request("GET", path, token=token)

    def post(self, path, token=None, body=None):
        return self.request("POST", path, token=token, body=body or {})

    def login(self, role, unit="", password=None):
        body = {"role": role, "unit": unit}
        if password is not None:
            body["password"] = password
        status, data = self.post("/api/login", body=body)
        assert status == 200, f"login failed: {status} {data}"
        return data["token"]


class LifeLineAPITests(unittest.TestCase):
    """Core API behavior: auth, case lifecycle, validation, permissions."""

    @classmethod
    def setUpClass(cls):
        cls.srv = LiveServer()
        cls.command_token = cls.srv.login("command")
        cls.responder_token = cls.srv.login("responder", "AMB-1024")

    @classmethod
    def tearDownClass(cls):
        cls.srv.stop()

    # ---- health / static ----
    def test_health_ok(self):
        status, data = self.srv.get("/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(data["ok"])
        self.assertEqual(data["service"], "life-line")

    def test_static_index_served(self):
        status, _ = self.srv.request("GET", "/", raw_path=True)
        self.assertEqual(status, 200)

    def test_static_unknown_file_404(self):
        status, _ = self.srv.request("GET", "/does-not-exist.html",
                                     raw_path=True)
        self.assertEqual(status, 404)

    def test_path_traversal_blocked(self):
        # Confirms traversal attempts never escape the public/ folder.
        # (The specific bug this project's server.py fix addresses — a
        # bare startswith(PUBLIC_DIR) letting a sibling dir like
        # "public_evil" slip through — needs such a sibling folder to
        # actually exploit, so it isn't reproducible from this test alone.
        # This still checks the general case stays blocked.)
        status, _ = self.srv.request("GET", "/%2e%2e/server.py",
                                     raw_path=True)
        self.assertIn(status, (400, 404))

    # ---- auth ----
    def test_state_read_requires_auth(self):
        status, data = self.srv.get("/api/state")
        self.assertEqual(status, 401)
        self.assertIn("error", data)

    def test_state_read_rejects_bad_token(self):
        # A syntactically present-but-invalid token is treated like an
        # authorization failure (403), distinct from no token at all (401).
        status, data = self.srv.get("/api/state", token="not-a-real-token")
        self.assertEqual(status, 403)

    def test_login_unknown_role_rejected(self):
        status, data = self.srv.post("/api/login",
                                     body={"role": "supervillain", "unit": ""})
        self.assertEqual(status, 400)

    def test_authenticated_state_read_ok(self):
        status, data = self.srv.get("/api/state", token=self.command_token)
        self.assertEqual(status, 200)
        self.assertIn("cases", data)
        self.assertIn("hospitals", data)

    # ---- permissions ----
    def test_attendant_cannot_create_case(self):
        attendant_token = self.srv.login("attendant")
        status, data = self.srv.post(
            "/api/cases", token=attendant_token,
            body={"priority": "urgent", "origin": "KEM Hospital",
                  "dest": "Bombay Hospital", "eta": 20})
        self.assertEqual(status, 403)

    # ---- case creation validation ----
    def test_create_case_requires_valid_priority(self):
        status, data = self.srv.post(
            "/api/cases", token=self.command_token,
            body={"priority": "super-urgent", "origin": "KEM Hospital",
                  "dest": "Bombay Hospital", "eta": 20})
        self.assertEqual(status, 400)

    def test_create_case_rejects_same_origin_and_dest(self):
        status, data = self.srv.post(
            "/api/cases", token=self.command_token,
            body={"priority": "urgent", "origin": "KEM Hospital",
                  "dest": "KEM Hospital", "eta": 20})
        self.assertEqual(status, 400)

    def test_create_case_rejects_out_of_range_eta(self):
        status, data = self.srv.post(
            "/api/cases", token=self.command_token,
            body={"priority": "urgent", "origin": "KEM Hospital",
                  "dest": "Bombay Hospital", "eta": 9999})
        self.assertEqual(status, 400)

    def test_create_case_rejects_bad_age(self):
        status, data = self.srv.post(
            "/api/cases", token=self.command_token,
            body={"priority": "urgent", "origin": "KEM Hospital",
                  "dest": "Bombay Hospital", "eta": 20, "age": 500})
        self.assertEqual(status, 400)

    # ---- full case lifecycle ----
    def test_full_case_lifecycle(self):
        status, data = self.srv.post(
            "/api/cases", token=self.command_token,
            body={"priority": "critical", "origin": "KEM Hospital",
                  "dest": "Bombay Hospital", "dept": "Cardiac ICU",
                  "eta": 15, "age": 50, "reason": "test transfer"})
        self.assertEqual(status, 200)
        case = data["case"]
        cid = case["id"]
        self.assertEqual(case["status"], 0)
        self.assertIsInstance(case["age"], int)  # regression check

        # claim with the responder's own unit
        status, _ = self.srv.post(f"/api/cases/{cid}/claim",
                                  token=self.responder_token)
        self.assertEqual(status, 200)

        # advance through IN TRANSIT -> ARRIVING -> ARRIVED
        for _ in range(3):
            status, _ = self.srv.post(f"/api/cases/{cid}/status",
                                      token=self.command_token)
            self.assertEqual(status, 200)

        status, snap = self.srv.get("/api/state", token=self.command_token)
        closed = next(c for c in snap["cases"] if c["id"] == cid)
        self.assertEqual(closed["status"], 3)  # ARRIVED

        # closed case can't be advanced again
        status, data = self.srv.post(f"/api/cases/{cid}/status",
                                     token=self.command_token)
        self.assertEqual(status, 400)

    def test_command_can_dispatch_available_ambulance(self):
        status, data = self.srv.post(
            "/api/cases", token=self.command_token,
            body={"priority": "critical", "origin": "KEM Hospital",
                  "dest": "Bombay Hospital", "dept": "Cardiac ICU",
                  "eta": 18, "age": 61, "reason": "dispatch test"})
        self.assertEqual(status, 200)
        cid = data["case"]["id"]

        status, _ = self.srv.post(
            f"/api/cases/{cid}/dispatch", token=self.command_token,
            body={"unit": "AMB-1025"})
        self.assertEqual(status, 200)

        status, snap = self.srv.get("/api/state", token=self.command_token)
        self.assertEqual(status, 200)
        case = next(c for c in snap["cases"] if c["id"] == cid)
        unit = next(u for u in snap["units"] if u["id"] == "AMB-1025")
        self.assertEqual(case["assigned_unit"], "AMB-1025")
        self.assertEqual(case["amb"], "AMB-1025")
        self.assertEqual(unit["status"], "en-route")
        self.assertEqual(unit["case"], cid)

        status, _ = self.srv.post(
            f"/api/cases/{cid}/dispatch", token=self.command_token,
            body={"unit": "AMB-1026"})
        self.assertEqual(status, 400)

    def test_responder_cannot_dispatch(self):
        status, data = self.srv.post(
            "/api/cases", token=self.command_token,
            body={"priority": "urgent", "origin": "KEM Hospital",
                  "dest": "Bombay Hospital", "eta": 20})
        self.assertEqual(status, 200)
        cid = data["case"]["id"]
        status, _ = self.srv.post(
            f"/api/cases/{cid}/dispatch", token=self.responder_token,
            body={"unit": "AMB-1025"})
        self.assertEqual(status, 403)

    def test_cancel_case(self):
        status, data = self.srv.post(
            "/api/cases", token=self.command_token,
            body={"priority": "priority", "origin": "KEM Hospital",
                  "dest": "Bombay Hospital", "eta": 20})
        cid = data["case"]["id"]
        status, _ = self.srv.post(f"/api/cases/{cid}/cancel",
                                  token=self.command_token,
                                  body={"reason": "test cancel"})
        self.assertEqual(status, 200)
        status, snap = self.srv.get("/api/state", token=self.command_token)
        cancelled = next(c for c in snap["cases"] if c["id"] == cid)
        self.assertEqual(cancelled["status"], 4)  # CANCELLED

    def test_add_note(self):
        status, data = self.srv.post(
            "/api/cases", token=self.command_token,
            body={"priority": "urgent", "origin": "KEM Hospital",
                  "dest": "Bombay Hospital", "eta": 20})
        cid = data["case"]["id"]
        status, _ = self.srv.post(f"/api/cases/{cid}/notes",
                                  token=self.command_token,
                                  body={"text": "handoff note"})
        self.assertEqual(status, 200)

    def test_unknown_case_action_returns_error(self):
        status, data = self.srv.post("/api/cases/LL-NOPE-000000/status",
                                     token=self.command_token)
        self.assertEqual(status, 400)

    # ---- reports ----
    def test_report_csv_requires_permission(self):
        status, _ = self.srv.request("GET", "/api/report.csv",
                                     token=self.responder_token,
                                     raw_path=True)
        self.assertEqual(status, 403)

    def test_report_csv_ok_for_command(self):
        status, _ = self.srv.request("GET", "/api/report.csv",
                                     token=self.command_token,
                                     raw_path=True)
        self.assertEqual(status, 200)


class RateLimitTests(unittest.TestCase):
    """Runs against its own server instance with a very low limit so the
    test doesn't need to fire 120+ requests."""

    @classmethod
    def setUpClass(cls):
        cls.srv = LiveServer(rate_limit=5)

    @classmethod
    def tearDownClass(cls):
        cls.srv.stop()

    def test_rate_limit_enforced(self):
        statuses = []
        for _ in range(10):
            status, _ = self.srv.post("/api/logout")
            statuses.append(status)
        self.assertIn(429, statuses,
                      "expected at least one 429 once the per-minute POST "
                      "limit was exceeded")


class RestartPersistenceTests(unittest.TestCase):
    """Regression test for the age-field type bug: a case's `age` must
    stay an int both right after creation and after the server restarts
    and reloads it from SQLite (which stores it as TEXT)."""

    def test_age_type_consistent_across_restart(self):
        srv = LiveServer()
        try:
            token = srv.login("command")
            status, data = srv.post(
                "/api/cases", token=token,
                body={"priority": "urgent", "origin": "KEM Hospital",
                      "dest": "Bombay Hospital", "eta": 20, "age": 62})
            self.assertEqual(status, 200)
            cid = data["case"]["id"]
            self.assertIsInstance(data["case"]["age"], int)

            srv.restart()
            token = srv.login("command")
            status, snap = srv.get("/api/state", token=token)
            self.assertEqual(status, 200)
            reloaded = next(c for c in snap["cases"] if c["id"] == cid)
            self.assertIsInstance(
                reloaded["age"], int,
                "age became a non-int type after reloading from SQLite "
                "on restart")
            self.assertEqual(reloaded["age"], 62)
        finally:
            srv.stop()


class SecureAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = LiveServer(auth_required=True, bootstrap=("ADMIN-001", "Correct-Horse-Battery-9"))

    @classmethod
    def tearDownClass(cls):
        cls.srv.stop()

    def test_password_required(self):
        status, _ = self.srv.post("/api/login", body={"role": "admin", "unit": "ADMIN-001"})
        self.assertEqual(status, 400)

    def test_bootstrap_admin_login(self):
        status, data = self.srv.post("/api/login", body={"role": "admin", "unit": "ADMIN-001", "password": "Correct-Horse-Battery-9"})
        self.assertEqual(status, 200)
        self.assertTrue(data.get("token"))

    def test_public_admin_registration_blocked(self):
        status, _ = self.srv.post("/api/users/register", body={"role": "admin", "unit": "EVIL-001", "password": "Correct-Horse-Battery-9"})
        self.assertIn(status, (401, 403))

    def test_admin_can_register_user(self):
        token = self.srv.login("admin", "ADMIN-001", "Correct-Horse-Battery-9")
        status, _ = self.srv.post("/api/users/register", token=token, body={"role": "responder", "unit": "AMB-9000", "password": "Responder-Password-9"})
        self.assertEqual(status, 201)
        status, data = self.srv.post("/api/login", body={"role": "responder", "unit": "AMB-9000", "password": "Responder-Password-9"})
        self.assertEqual(status, 200)
        self.assertTrue(data.get("token"))

    def test_hospitals_require_auth(self):
        status, _ = self.srv.get("/api/hospitals")
        self.assertEqual(status, 401)


if __name__ == "__main__":
    unittest.main(verbosity=2)
