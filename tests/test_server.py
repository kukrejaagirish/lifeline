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

DEMO_PIN = "1234"
DEFAULT_IDS = {"command": "CMD-01", "admin": "ADMIN-001", "responder": "AMB-1024",
               "sending": "SEND-01", "dest": "DEST-01", "attendant": "ATT-01",
               "police": "POL-01", "traffic": "TRF-01"}

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

    def __init__(self, rate_limit=None, env_extra=None):
        self.tmpdir = tempfile.mkdtemp(prefix="lifeline-test-")
        shutil.copy2(SERVER_SRC, os.path.join(self.tmpdir, "server.py"))
        shutil.copytree(PUBLIC_SRC, os.path.join(self.tmpdir, "public"))
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        env = dict(os.environ)
        env["LIFELINE_DEMO_PIN"] = DEMO_PIN
        if rate_limit is not None:
            env["LIFELINE_RATE_LIMIT"] = str(rate_limit)
        env.update(env_extra or {})
        self.env = env
        # Log to a file, not a pipe nobody reads: a full 64 KB pipe buffer
        # would block the server mid-test.
        self.log_path = os.path.join(self.tmpdir, "server.log")
        self._log = open(self.log_path, "a")
        self.proc = subprocess.Popen(
            [sys.executable, "server.py", "--port", str(self.port),
             "--fresh", "--no-sim"],
            cwd=self.tmpdir, env=env,
            stdout=self._log, stderr=subprocess.STDOUT)
        self._wait_ready()

    def _wait_ready(self, timeout=10):
        deadline = time.time() + timeout
        last_err = None
        while time.time() < deadline:
            if self.proc.poll() is not None:
                out = self.read_log()
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

    def read_log(self):
        try:
            with open(self.log_path, encoding="utf-8", errors="replace") as fh:
                return fh.read()
        except OSError:
            return ""

    def stop(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=5)
        self._log.close()
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
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self.proc = subprocess.Popen(
            [sys.executable, "server.py", "--port", str(self.port),
             "--no-sim"],
            cwd=self.tmpdir, env=self.env,
            stdout=self._log, stderr=subprocess.STDOUT)
        self._wait_ready()

    # ---- HTTP helpers ----
    def request(self, method, path, token=None, body=None, raw_path=False,
                headers=None, raw=None):
        url = self.base + path
        data = raw if raw is not None else (
            json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(url, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        for k, v in (headers or {}).items():
            req.add_header(k, v)
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

    def post(self, path, token=None, body=None, headers=None, raw=None):
        return self.request("POST", path, token=token, body=body or {},
                            headers=headers, raw=raw)

    def login(self, role, unit=None, pin=None):
        unit = unit or DEFAULT_IDS[role]
        body = {"role": role, "unit": unit}
        if pin or role in ("command", "admin"):
            body["pin"] = pin or DEMO_PIN
        status, data = self.post("/api/login", body=body)
        assert status == 200, f"login failed: {status} {data}"
        return data["token"]


class LifeLineAPITests(unittest.TestCase):
    """Core API behavior: auth, case lifecycle, validation, permissions."""

    @classmethod
    def setUpClass(cls):
        cls.srv = LiveServer()
        cls.addClassCleanup(cls.srv.stop)
        cls.command_token = cls.srv.login("command")
        cls.responder_token = cls.srv.login("responder", "AMB-1024")

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
        # v3.4: an unknown/expired/revoked token is "no live session" (401,
        # with a code the UI can act on); 403 is reserved for a live session
        # whose role lacks the permission.
        status, data = self.srv.get("/api/state", token="not-a-real-token")
        self.assertEqual(status, 401)
        self.assertEqual(data.get("code"), "session_invalid")

    def test_live_session_wrong_role_is_403(self):
        token = self.srv.login("dest")
        status, data = self.srv.get("/api/report.csv", token=token)
        self.assertEqual(status, 403)
        self.assertEqual(data.get("code"), "forbidden")

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
        cls.addClassCleanup(cls.srv.stop)

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


class OperatorLoginTests(unittest.TestCase):
    """Sign-in rules (v3.4): operator ID required, IDs keep their role,
    Command/Admin need a PIN, one live session per operator ID."""

    @classmethod
    def setUpClass(cls):
        cls.srv = LiveServer()
        cls.addClassCleanup(cls.srv.stop)

    def login_raw(self, **body):
        return self.srv.post("/api/login", body=body)

    def test_operator_id_login_ok(self):
        status, data = self.login_raw(role="responder", unit="AMB-1025")
        self.assertEqual(status, 200)
        self.assertTrue(data.get("token"))
        self.assertEqual(data["unit"], "AMB-1025")
        self.assertEqual(data["role_label"], "Responder")

    def test_missing_operator_id_rejected(self):
        status, data = self.login_raw(role="responder", unit="")
        self.assertEqual(status, 400)
        self.assertIn("required", data["error"])

    def test_invalid_operator_id_rejected(self):
        status, _ = self.login_raw(role="responder", unit="AMB 1024<script>")
        self.assertEqual(status, 400)

    def test_non_string_operator_id_is_400_not_500(self):
        status, _ = self.login_raw(role="responder", unit=1024)
        self.assertEqual(status, 400)

    def test_admin_requires_pin(self):
        status, data = self.login_raw(role="admin", unit="ADMIN-001")
        self.assertEqual(status, 401)
        self.assertEqual(data["code"], "pin_required")

    def test_admin_with_pin_ok_and_extra_fields_ignored(self):
        status, data = self.login_raw(role="admin", unit="ADMIN-001", pin=DEMO_PIN,
                                      credential="ignored")
        self.assertEqual(status, 200)
        self.assertTrue(data.get("token"))

    def test_wrong_pin_then_lockout(self):
        for i in range(5):
            status, data = self.login_raw(role="command", unit="CMD-01", pin="9999")
            self.assertEqual(status, 401)
            self.assertEqual(data["code"], "pin_wrong")
        status, data = self.login_raw(role="command", unit="CMD-01", pin=DEMO_PIN)
        self.assertEqual(status, 429)
        self.assertEqual(data["code"], "login_locked")

    def test_unregistered_privileged_id_rejected(self):
        status, data = self.login_raw(role="command", unit="CMD-99", pin=DEMO_PIN)
        self.assertEqual(status, 401)
        self.assertEqual(data["code"], "not_registered")

    def test_role_mismatch_rejected(self):
        status, data = self.login_raw(role="command", unit="AMB-1024", pin=DEMO_PIN)
        self.assertEqual(status, 403)
        self.assertEqual(data["code"], "role_mismatch")

    def test_new_id_self_registers_in_open_demo_mode(self):
        status, data = self.login_raw(role="sending", unit="SEND-77")
        self.assertEqual(status, 200)
        self.assertTrue(data["first_login"])
        status, data = self.login_raw(role="sending", unit="SEND-77")
        self.assertEqual(status, 200)
        self.assertFalse(data["first_login"])
        # …and is now bound to that role
        status, data = self.login_raw(role="police", unit="SEND-77")
        self.assertEqual(status, 403)

    def test_same_id_twice_replaces_older_session(self):
        s1, d1 = self.login_raw(role="responder", unit="AMB-2290")
        s2, d2 = self.login_raw(role="responder", unit="AMB-2290")
        self.assertEqual((s1, s2), (200, 200))
        self.assertEqual(d1["session"]["replaced_previous"], 0)
        self.assertEqual(d2["session"]["replaced_previous"], 1)
        status, data = self.srv.get("/api/state", token=d1["token"])
        self.assertEqual(status, 401)
        self.assertEqual(data["code"], "session_replaced")
        status, _ = self.srv.get("/api/state", token=d2["token"])
        self.assertEqual(status, 200)

    def test_same_id_case_insensitive(self):
        s1, d1 = self.login_raw(role="responder", unit="AMB-8871")
        s2, d2 = self.login_raw(role="responder", unit="amb-8871")
        self.assertEqual((s1, s2), (200, 200))
        self.assertEqual(d2["unit"], "AMB-8871")
        self.assertEqual(d2["session"]["replaced_previous"], 1)

    def test_different_ids_are_independent(self):
        _, a = self.login_raw(role="responder", unit="AMB-5510")
        _, b = self.login_raw(role="responder", unit="AMB-1026")
        self.assertEqual(self.srv.get("/api/state", token=a["token"])[0], 200)
        self.assertEqual(self.srv.get("/api/state", token=b["token"])[0], 200)

    def test_concurrent_logins_leave_exactly_one_session(self):
        import threading
        out = []

        def go():
            out.append(self.login_raw(role="traffic", unit="TRF-01"))
        threads = [threading.Thread(target=go) for _ in range(5)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertTrue(all(s == 200 for s, _ in out))
        alive = [d["token"] for _, d in out
                 if self.srv.get("/api/state", token=d["token"])[0] == 200]
        self.assertEqual(len(alive), 1)

    def test_logout_then_token_is_401(self):
        token = self.srv.login("police")
        self.assertEqual(self.srv.post("/api/logout", token=token)[0], 200)
        status, data = self.srv.get("/api/state", token=token)
        self.assertEqual(status, 401)
        self.assertEqual(data["code"], "signed_out")

    def test_public_user_registration_blocked(self):
        status, _ = self.srv.post("/api/users/register",
                                  body={"role": "responder", "unit": "AMB-9000"})
        self.assertEqual(status, 401)

    def test_admin_can_register_user(self):
        token = self.srv.login("admin")
        status, _ = self.srv.post("/api/users/register", token=token,
                                  body={"role": "responder", "unit": "AMB-9000"})
        self.assertEqual(status, 201)
        status, data = self.srv.post("/api/login", body={"role": "responder", "unit": "AMB-9000"})
        self.assertEqual(status, 200)
        self.assertFalse(data["first_login"])

    def test_admin_registering_command_needs_pin(self):
        token = self.srv.login("admin")
        status, _ = self.srv.post("/api/users/register", token=token,
                                  body={"role": "command", "unit": "CMD-02"})
        self.assertEqual(status, 400)
        status, _ = self.srv.post("/api/users/register", token=token,
                                  body={"role": "command", "unit": "CMD-02", "pin": "8642"})
        self.assertEqual(status, 201)
        self.assertEqual(self.srv.post("/api/login", body={
            "role": "command", "unit": "CMD-02", "pin": "8642"})[0], 200)

    def test_hospitals_require_auth(self):
        status, _ = self.srv.get("/api/hospitals")
        self.assertEqual(status, 401)


class StrictLoginTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = LiveServer(env_extra={"LIFELINE_OPEN_LOGIN": "0"})
        cls.addClassCleanup(cls.srv.stop)

    def test_unknown_id_rejected_in_strict_mode(self):
        status, data = self.srv.post("/api/login", body={"role": "responder", "unit": "ZZZ-404"})
        self.assertEqual(status, 401)
        self.assertEqual(data["code"], "not_registered")

    def test_registered_id_ok_in_strict_mode(self):
        status, _ = self.srv.post("/api/login", body={"role": "responder", "unit": "AMB-1024"})
        self.assertEqual(status, 200)


class HardeningTests(unittest.TestCase):
    """Ownership, privacy, input types and bookkeeping fixes from the audit."""

    @classmethod
    def setUpClass(cls):
        cls.srv = LiveServer()
        cls.addClassCleanup(cls.srv.stop)
        cls.cmd = cls.srv.login("command")

    def new_case(self, **kw):
        body = {"priority": "urgent", "origin": "KEM Hospital",
                "dest": "Bombay Hospital", "eta": 20, "age": 54,
                "reason": "Head injury, needs CT"}
        body.update(kw)
        status, data = self.srv.post("/api/cases", token=self.cmd, body=body)
        self.assertEqual(status, 200, data)
        return data["case"]["id"]

    def test_responder_cannot_move_another_units_run(self):
        cid = self.new_case()
        self.assertEqual(self.srv.post(f"/api/cases/{cid}/dispatch", token=self.cmd,
                                       body={"unit": "AMB-1024"})[0], 200)
        other = self.srv.login("responder", "AMB-1025")
        status, data = self.srv.post(f"/api/cases/{cid}/status", token=other)
        self.assertEqual(status, 403)
        self.assertEqual(data["code"], "not_your_run")
        mine = self.srv.login("responder", "AMB-1024")
        self.assertEqual(self.srv.post(f"/api/cases/{cid}/status", token=mine)[0], 200)

    def test_police_view_has_no_clinical_data(self):
        cid = self.new_case(reason="Confidential diagnosis")
        police = self.srv.login("police")
        status, snap = self.srv.get("/api/state", token=police)
        self.assertEqual(status, 200)
        case = next(c for c in snap["cases"] if c["id"] == cid)
        self.assertEqual(case["reason"], "Restricted (clinical)")
        self.assertEqual(case["age"], "—")
        self.assertTrue(snap.get("redacted"))
        status, snap = self.srv.get("/api/state", token=self.cmd)
        case = next(c for c in snap["cases"] if c["id"] == cid)
        self.assertEqual(case["reason"], "Confidential diagnosis")

    def test_non_string_fields_are_400_not_500(self):
        for body in ({"origin": 12345}, {"dest": ["x"]}, {"reason": {"a": 1}},
                     {"dept": 7}, {"eta": True}, {"age": True}):
            payload = {"priority": "urgent", "origin": "KEM Hospital",
                       "dest": "Bombay Hospital", "eta": 20}
            payload.update(body)
            status, _ = self.srv.post("/api/cases", token=self.cmd, body=payload)
            self.assertEqual(status, 400, body)
        cid = self.new_case()
        status, _ = self.srv.post(f"/api/cases/{cid}/dispatch", token=self.cmd,
                                  body={"unit": 1024})
        self.assertEqual(status, 400)
        status, _ = self.srv.post(f"/api/cases/{cid}/notes", token=self.cmd,
                                  body={"text": 5})
        self.assertEqual(status, 400)

    def test_unknown_destination_rejected_and_name_canonicalised(self):
        status, data = self.srv.post("/api/cases", token=self.cmd, body={
            "priority": "urgent", "origin": "KEM Hospital",
            "dest": "Imaginary Hospital", "eta": 20})
        self.assertEqual(status, 400)
        status, data = self.srv.post("/api/cases", token=self.cmd, body={
            "priority": "urgent", "origin": "KEM Hospital",
            "dest": "bombay hospital", "eta": 20})
        self.assertEqual(status, 200)
        self.assertEqual(data["case"]["dest"], "Bombay Hospital")

    def test_rejected_case_does_not_burn_a_case_number(self):
        a = self.new_case()
        status, _ = self.srv.post("/api/cases", token=self.cmd, body={
            "priority": "urgent", "origin": "KEM Hospital", "dest": "Bombay Hospital",
            "eta": 20, "incident_id": "MCI-999"})
        self.assertEqual(status, 400)
        b = self.new_case()
        self.assertEqual(int(b.rsplit("-", 1)[1]), int(a.rsplit("-", 1)[1]) + 1)

    def test_malformed_json_message(self):
        status, data = self.srv.post("/api/cases", token=self.cmd, raw=b"{not json")
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], "Invalid JSON body.")

    def test_no_handover_on_cancelled_case(self):
        cid = self.new_case()
        self.srv.post(f"/api/cases/{cid}/cancel", token=self.cmd, body={"reason": "x"})
        status, _ = self.srv.post(f"/api/cases/{cid}/handover", token=self.cmd,
                                  body={"item": "patient_identity", "done": True})
        self.assertEqual(status, 400)

    def test_triage_heuristic_no_substring_false_positives(self):
        status, r = self.srv.post("/api/triage", token=self.cmd, body={
            "notes": "Patient stable, mild heartburn, uncertain history"})
        self.assertEqual(status, 200)
        self.assertEqual((r["priority"], r["dept"], r["tags"]), ("priority", "Emergency", []))
        status, r = self.srv.post("/api/triage", token=self.cmd, body={
            "notes": "Stabbed in abdomen, severe bleeding, 30 yo"})
        self.assertEqual((r["priority"], r["dept"], r["age"]), ("critical", "Trauma", 30))
        self.assertIn("Blood Onboard", r["tags"])
        status, r = self.srv.post("/api/triage", token=self.cmd, body={
            "notes": "Laboured breathing"})
        self.assertNotEqual(r["dept"], "Obstetric ICU")

    def test_session_endpoint(self):
        status, data = self.srv.get("/api/session", token=self.cmd)
        self.assertEqual(status, 200)
        self.assertEqual(data["unit"], "CMD-01")

    def test_token_never_written_to_log(self):
        import urllib.request as ur
        try:
            r = ur.urlopen(f"{self.srv.base}/api/events?token={self.cmd}", timeout=3)
            first = r.read(40).decode()
            r.close()
        except Exception as e:
            self.fail(f"SSE did not open: {e}")
        self.assertIn("connected", first)
        time.sleep(0.3)
        log = self.srv.read_log()
        self.assertIn("/api/events?token=***", log)
        self.assertNotIn(self.cmd, log)


class IoTTests(unittest.TestCase):
    """Raspberry Pi ambulance kit → POST /api/iot/telemetry."""

    KEY = "demo-pi-key-1024"

    @classmethod
    def setUpClass(cls):
        cls.srv = LiveServer(env_extra={"LIFELINE_IOT_MIN_INTERVAL_S": "0"})
        cls.addClassCleanup(cls.srv.stop)
        cls.cmd = cls.srv.login("command")
        cls.seq = 0

    def send(self, key=KEY, **kw):
        IoTTests.seq += 1
        body = {"device_id": "PI-AMB-1024", "seq": IoTTests.seq,
                "gps": {"lat": 18.975, "lng": 72.8258, "speed_kmh": 40},
                "vitals": {"spo2": 97, "hr": 88, "temp_c": 36.8}, "button": "none"}
        body.update(kw)
        headers = {"X-Device-Key": key} if key else {}
        return self.srv.post("/api/iot/telemetry", body=body, headers=headers)

    def active_case(self):
        status, data = self.srv.post("/api/cases", token=self.cmd, body={
            "priority": "urgent", "origin": "KEM Hospital", "dest": "Bombay Hospital",
            "eta": 25, "age": 47, "reason": "Chest pain"})
        cid = data["case"]["id"]
        self.srv.post(f"/api/cases/{cid}/dispatch", token=self.cmd, body={"unit": "AMB-1024"})
        return cid

    def case(self, cid):
        _, snap = self.srv.get("/api/state", token=self.cmd)
        return next(c for c in snap["cases"] if c["id"] == cid)

    def test_1_valid_reading_without_case(self):
        status, data = self.send()
        self.assertEqual(status, 202)
        self.assertTrue(data["accepted"])
        self.assertEqual(data["unit"], "AMB-1024")
        self.assertIsNone(data["case_id"])
        self.assertEqual(data["next_interval_s"], 5)

    def test_2_vitals_reach_case_and_alerts_fire(self):
        cid = self.active_case()
        status, data = self.send(vitals={"spo2": 86, "hr": 134, "temp_c": 37.2})
        self.assertEqual(status, 202)
        self.assertEqual(data["case_id"], cid)
        self.assertIn("SpO2 low: 86%", data["alerts"])
        self.assertIn("Heart rate high: 134 bpm", data["alerts"])
        c = self.case(cid)
        self.assertEqual(c["vitals"]["spo2"], 86)
        self.assertTrue(c["iot_alerts"])
        # police never see vitals
        police = self.srv.login("police")
        _, snap = self.srv.get("/api/state", token=police)
        pc = next(x for x in snap["cases"] if x["id"] == cid)
        self.assertNotIn("vitals", pc)
        # panic → critical
        status, data = self.send(button="panic")
        self.assertEqual(status, 202)
        self.assertEqual(self.case(cid)["priority"], "critical")
        # arrival button on a run not yet departed is ignored
        status, data = self.send(button="arrived")
        self.assertIn("arrival ignored", data["actions"][0])
        # depart, then arrival closes the run
        mine = self.srv.login("responder", "AMB-1024")
        self.srv.post(f"/api/cases/{cid}/status", token=mine)
        status, data = self.send(button="arrived")
        self.assertEqual(status, 202)
        self.assertEqual(self.case(cid)["status"], 3)

    def test_3_bad_data_rejected_with_field_errors(self):
        status, data = self.send(gps={"lat": 123.4, "lng": "east"},
                                 vitals={"spo2": 140, "hr": -5}, button="boom")
        self.assertEqual(status, 400)
        self.assertEqual(data["code"], "bad_telemetry")
        for f in ("gps.lat", "gps.lng", "vitals.spo2", "vitals.hr", "button"):
            self.assertIn(f, data["fields"])

    def test_4_unknown_device_and_wrong_key(self):
        status, data = self.send(device_id="PI-GHOST-1")
        self.assertEqual(status, 401)
        self.assertEqual(data["code"], "device_unauthorized")
        status, data2 = self.send(key="wrong-key")
        self.assertEqual(status, 401)
        self.assertEqual(data["error"], data2["error"])   # no device enumeration
        status, data = self.send(key=None)
        self.assertEqual(status, 401)
        self.assertEqual(data["code"], "device_key_missing")

    def test_5_replayed_sequence_rejected(self):
        self.send()
        status, data = self.srv.post("/api/iot/telemetry", body={
            "device_id": "PI-AMB-1024", "seq": 1, "button": "none"},
            headers={"X-Device-Key": self.KEY})
        self.assertEqual(status, 409)
        self.assertEqual(data["code"], "stale_seq")

    def test_6_device_admin(self):
        status, data = self.srv.get("/api/iot/devices", token=self.cmd)
        self.assertEqual(status, 200)
        self.assertEqual(data["devices"][0]["device_id"], "PI-AMB-1024")
        responder = self.srv.login("responder", "AMB-1026")
        self.assertEqual(self.srv.get("/api/iot/devices", token=responder)[0], 403)
        admin = self.srv.login("admin")
        status, data = self.srv.post("/api/iot/devices", token=admin,
                                     body={"device_id": "PI-AMB-1026", "unit": "AMB-1026"})
        self.assertEqual(status, 201)
        key = data["device_key"]
        status, data = self.srv.post("/api/iot/telemetry", body={
            "device_id": "PI-AMB-1026", "seq": 1, "button": "none"},
            headers={"X-Device-Key": key})
        self.assertEqual(status, 202)
        self.assertEqual(data["unit"], "AMB-1026")


class IoTRateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = LiveServer(env_extra={"LIFELINE_IOT_MIN_INTERVAL_S": "2"})
        cls.addClassCleanup(cls.srv.stop)

    def test_too_frequent_readings_get_429(self):
        h = {"X-Device-Key": "demo-pi-key-1024"}
        s1, _ = self.srv.post("/api/iot/telemetry", body={"device_id": "PI-AMB-1024", "seq": 1, "button": "none"}, headers=h)
        s2, d2 = self.srv.post("/api/iot/telemetry", body={"device_id": "PI-AMB-1024", "seq": 2, "button": "none"}, headers=h)
        self.assertEqual((s1, s2), (202, 429))
        self.assertEqual(d2["code"], "too_frequent")


class SimulatorTests(unittest.TestCase):
    """iot/iot_simulator.py (the Pi stand-in) against a live server."""

    @classmethod
    def setUpClass(cls):
        cls.srv = LiveServer(env_extra={"LIFELINE_IOT_MIN_INTERVAL_S": "0"})
        cls.addClassCleanup(cls.srv.stop)

    def run_sim(self, *args):
        sim = os.path.join(REPO_ROOT, "iot", "iot_simulator.py")
        return subprocess.run([sys.executable, sim, "--server", self.srv.base,
                               "--interval", "0", *args],
                              capture_output=True, text=True, timeout=60)

    def test_normal_run_all_accepted(self):
        p = self.run_sim("--count", "3", "--start-seq", "1000")
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertEqual(p.stdout.count("→ 202"), 3)

    def test_deteriorating_patient_raises_alerts(self):
        p = self.run_sim("--count", "6", "--scenario", "deteriorate", "--start-seq", "200")
        self.assertEqual(p.returncode, 0, p.stdout)
        self.assertIn("SpO2 low", p.stdout)

    def test_bad_data_rejected(self):
        p = self.run_sim("--scenario", "bad-data", "--start-seq", "300")
        self.assertEqual(p.returncode, 0, p.stdout)
        self.assertIn("→ 400", p.stdout)

    def test_unknown_device_rejected(self):
        p = self.run_sim("--scenario", "unknown-device")
        self.assertEqual(p.returncode, 0, p.stdout)
        self.assertIn("→ 401", p.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
