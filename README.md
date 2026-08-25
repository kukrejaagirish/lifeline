# LIFE-LINE 2.0
### Emergency Medical Transfer Coordination for Mumbai

**The problem:** Inter-hospital patient transfers in Mumbai (ambulance-to-ICU, hospital-to-hospital) are coordinated over phone calls and WhatsApp. There's no shared source of truth for which hospital has a free ICU bed, which ambulance is available, or whether a critical transfer is running late. Minutes matter — and right now they're lost to manual coordination.

**What LIFE-LINE does:** A real-time coordination platform that lets sending hospitals, ambulance responders, and a command center track a patient transfer from registration to handover — with automatic destination recommendation, live SLA monitoring, and mass-casualty incident support.

---

## Key features

- **Smart destination recommendation** — scores nearby hospitals by department match, ICU/general bed availability, and haversine distance, so a coordinator sees the *best* hospital, not just the nearest one.
- **Live case lifecycle** — Registered → Claimed → En Route → Arrived → Handover, updated in real time to every connected client via server-sent events.
- **SLA engine** — auto-escalates cases stuck in "Registered" too long, and flags transfers that are running later than their estimated arrival, so nothing silently falls through the cracks.
- **Mass-casualty incident (MCI) mode** — group multiple cases under one incident for triage-style coordination during a multi-casualty event.
- **Handover checklist** — a proof-of-delivery checklist at the receiving hospital, so a transfer isn't just "arrived," it's *confirmed received*.
- **Role-based access** — sending hospital, responder, command center, and traffic control each see and can do only what their role needs.
- **Notifications** — SMS/radio-style alerts on key events (registered, delayed, arrived, escalated), with optional real Twilio SMS integration.
- **Installable PWA** — works offline-first on a phone or tablet in a moving ambulance or hospital front desk.

## Why it's built this way

The backend is **dependency-free Python** (standard library only — `http.server`, `sqlite3`, no Flask/FastAPI, no pip install) on purpose: it needs to run on constrained, sometimes offline hospital hardware without a fragile dependency chain. The frontend is vanilla JS/HTML/CSS for the same reason — no build step, no framework version drift, easy to audit line-by-line.

That constraint also forced a cleaner design: a single `Store` class owns all state with write-through SQLite persistence, a lock-protected in-memory cache for speed, and an event hub that broadcasts every state change over SSE to all connected dashboards instantly.

## Security & robustness

This isn't a toy demo — it went through a dedicated hardening pass:
- PBKDF2 password hashing for optional account login
- Path-traversal-safe static file serving
- Per-IP rate limiting with automatic memory cleanup (no unbounded growth on long-running deployments)
- No internal error details leaked to clients (server-side logging only)
- Clean shutdown handling (in-flight state flushed to SQLite on exit)
- 21-test automated suite covering auth, permissions, rate limiting, SLA logic, and the security fixes above

## Architecture

```
┌─────────────────┐         SSE / REST          ┌──────────────────┐
│  PWA Frontend    │ ◄──────────────────────────► │  Python stdlib    │
│  (vanilla JS)    │                              │  HTTP server       │
│  - Live dashboard│                              │  - Store (SQLite)  │
│  - Role views    │                              │  - SLA engine      │
│  - Offline cache │                              │  - Notify (Twilio) │
└─────────────────┘                              └──────────────────┘
```

## Running it locally

```bash
python server.py
```

Then open `http://localhost:8000` (or the port printed on boot). No `pip install` required.

## Running the tests

```bash
python tests/test_server.py
```

## Roadmap

- Split `server.py`/`app.js` into modules as the codebase grows
- Distributed rate limiting for multi-instance deployments
- SMS-based case updates for responders without smartphone access

---

Built by Girish Kukreja
