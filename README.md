# Life-Line — Emergency Transfer Coordination

Advanced coordination platform for emergency patient transfers: field responders,
hospitals, police, traffic control and a command center sharing one live state.

![mode](https://img.shields.io/badge/backend-Python%20stdlib%20only-blue)
![deps](https://img.shields.io/badge/storage-SQLite%20(stdlib)-brightgreen)

## Quick start

```
cd lifeline
start.bat            (or: python server.py)
```

Open **http://127.0.0.1:8787** in your browser. Sign in as *Responder* or
*Command Center* (or any stakeholder role). Open more tabs — even on other
devices on your network via `http://<your-ip>:8787` — and watch every action
sync in real time.

Deep-link a role: `http://127.0.0.1:8787/#responder/AMB-1024` or `/#command`.

No Python? Open `public/index.html` directly — the app detects the missing
server and runs in **offline demo mode** (mock data, synced across tabs of that
browser only). The app is also a **PWA**: installable, with the static shell
cached for offline use (API always requires the network).

## What's new in v3

### Backend (`server.py` — zero dependencies)

| Capability | Details |
|---|---|
| SQLite persistence | Write-through to `data/lifeline.db`; legacy `state.json` auto-imported |
| SLA watchdog | REGISTERED cases older than threshold auto-escalate + notify; transfers exceeding ETA flagged DELAYED (always-on, even with `--no-sim`) |
| Notifications log | SMS/WhatsApp/radio dispatch per event; **simulated** unless Twilio env vars set — status shown honestly per message |
| Smart recommendations | `GET /api/recommend` scores hospitals by specialty match, free ICU beds and distance |
| ETA prediction | `GET /api/predict` returns historical average duration for a route/priority |
| MCI incidents | Declare/close mass-casualty incidents; link cases; live per-priority counts |
| Handover POD | 5-item checklist per case with actor + timestamp; complete = proof of delivery |
| Equipment tags | Ventilator, Isolation, Incubator, Blood Onboard, … validated server-side |
| User accounts | `POST /api/users/register` — PBKDF2-SHA256 (100k iters) password logins optional |
| HTTPS | `--tls --cert file --key file` serves TLS directly |
| Rate limiting | Default 120 POST/min/IP → HTTP 429 (env-tunable) |
| CSV reports | `GET /api/report.csv` — full case export for command/admin |
| Blood bank board | Live units per region × blood type, drifts with simulation |
| Multi-region data | `--region mumbai` dataset switch (areas, contacts, center) |

### Frontend (`public/`)

- **Live operations map** (Leaflet): hospital markers colored by bed pressure,
  dashed priority-colored transfer routes, ambulances interpolated along routes
- **Hindi + Marathi UI** (EN/HI/MR selector) alongside English
- **Light/dark theme**, persisted
- **Voice announcements** (speech synthesis) for new critical & delayed transfers
- Destination **suggestions** while typing (scored chips) + historical ETA hints
- MCI banner: declare/close incidents, link cases at creation time
- Handover checklist in the case panel + printable handover sheet
- Notifications log and blood bank board on the command dashboard
- DELAYED pulse chips, equipment tag chips everywhere
- CSV export button (server report in live mode, client blob offline)
- Keyboard shortcuts: `N` new · `/` search · `M` map · `T` theme · `V` voice · `Esc` close · `?` help
- PWA: manifest + service worker (cache-first static shell, network-only API)
- All v2 features retained: SSE sync, role permissions, bed reservation, notes,
  audit trail, analytics, PDF export, audible alerts, offline mode

## CLI flags

```
python server.py [--host 127.0.0.1] [--port 8787] [--fresh] [--no-sim]
                 [--region mumbai] [--tls --cert FILE --key FILE]
```

- `--fresh` discard saved database and reseed demo data
- `--no-sim` disable the demo simulation (SLA watchdog stays active)
- `--region` dataset selection (default `mumbai`)

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `LIFELINE_TWILIO_SID` / `LIFELINE_TWILIO_AUTH` / `LIFELINE_TWILIO_FROM` | — | Enable real SMS/WhatsApp dispatch via Twilio. Without them, dispatch is logged as `simulated`. |
| `LIFELINE_SLA_REGISTER_MIN` | `10` | Minutes a case may sit REGISTERED before auto-escalation |
| `LIFELINE_DELAY_GRACE_MIN` | `10` | Grace minutes past ETA before DELAYED flag |
| `LIFELINE_RATE_LIMIT` | `120` | POST requests per minute per IP |

Settings can live in a `.env` file next to `server.py` (see `.env.example`);
real environment variables take priority. The current dispatch mode is shown
in `/api/health`, in the startup banner, and on the command dashboard's
notification panel.

### Enabling real SMS / WhatsApp (Twilio)

1. Create an account at [console.twilio.com](https://console.twilio.com).
2. Copy the **Account SID** (`AC…`) and **Auth Token** from the dashboard.
3. Get a sending number:
   - *SMS:* buy a number (or use the trial number) — E.164 format, e.g. `+15551234567`.
   - *WhatsApp:* use the sandbox number `+14155238886`; each recipient must first
     send the sandbox join code to it from their WhatsApp.
4. Trial accounts can only message **verified** caller IDs — verify your phone
   under *Phone Numbers → Verified Caller IDs*.
5. Copy `.env.example` to `.env` and fill in:

   ```
   LIFELINE_TWILIO_SID=ACxxxxxxxxxxxxxxxx
   LIFELINE_TWILIO_AUTH=your-auth-token
   LIFELINE_TWILIO_FROM=+15551234567
   ```

6. Restart the server. The banner and dashboard should now read
   **LIVE (Twilio)**; every message's real delivery status appears in the
   notification log (`sent` / `failed: …`).

## API reference

All mutations require `Authorization: Bearer <token>`.

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/health` | — | Liveness, version, uptime |
| POST | `/api/login` | — | `{role, unit[, password]}` → token |
| POST | `/api/users/register` | — | `{role, unit, password}` — create password account |
| POST | `/api/logout` | any | Invalidate token |
| GET | `/api/state` | any role | Full snapshot incl. notifications, incidents, blood banks |
| GET | `/api/events?token=` | any role | SSE stream of snapshots |
| GET | `/api/hospitals` | — | Directory with live bed counts |
| GET | `/api/audit` | any role | Recent audit entries |
| GET | `/api/notifications` | state_read | Dispatch log with delivery status |
| GET | `/api/recommend?dept=&origin=` | state_read | Top-5 destination suggestions |
| GET | `/api/predict?origin=&dest=&priority=` | state_read | Historical ETA prediction |
| GET | `/api/report.csv` | command, admin | CSV export of all cases |
| POST | `/api/cases` | sending, responder, command | Create case (+bed reserve, tags, incident link) |
| POST | `/api/cases/{id}/status` | responder, command | Advance lifecycle status |
| POST | `/api/cases/{id}/claim` | responder | Claim an unassigned run |
| POST | `/api/cases/{id}/assign` | command | `{unit}` — assign ambulance |
| POST | `/api/cases/{id}/traffic` | responder, command, traffic | Flag heavy congestion |
| POST | `/api/cases/{id}/notes` | any role | `{text}` — add coordination note |
| POST | `/api/cases/{id}/cancel` | command | `{reason}` — cancel + release resources |
| POST | `/api/cases/{id}/escalate` | command | Raise priority one level |
| POST | `/api/cases/{id}/handover` | responder, command | `{item, done}` — tick POD checklist |
| POST | `/api/incidents` | command | `{name, location}` — declare MCI |
| POST | `/api/incidents/{id}/close` | command | Close an incident |

## Architecture

```
browser tabs/devices ──fetch POST──▶ ┌──────────────┐
        ▲                            │  server.py   │
        └──── SSE snapshots ─────────│  Store (lock)│──▶ data/lifeline.db (SQLite)
                                     │  SLA watchdog│
                                     │  Sim engine  │
                                     │  Auth/Perms  │
                                     └──────────────┘
```

Every mutation bumps a revision counter, persists immediately and broadcasts a
full snapshot; clients re-render from snapshots, so all views converge.

## Notes & disclaimer

Demo/training software using mock Mumbai-area data. Not for real dispatch.
Hospital bed numbers are simulated. SMS/WhatsApp dispatch is simulated unless
Twilio credentials are configured — the notification log always shows the true
delivery status of each message. Verify emergency numbers independently.
