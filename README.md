# Life-Line — Emergency Transfer Coordination

Advanced coordination platform for emergency patient transfers: field responders,
hospitals, police, traffic control and a command center sharing one live state.

![mode](https://img.shields.io/badge/backend-Python%20stdlib%20only-blue)
![deps](https://img.shields.io/badge/storage-SQLite%20(stdlib)-brightgreen)

## The problem

Ambulance-to-hospital handoffs in Indian metros routinely lose time to
fragmented communication: a responder calls a hospital that turns out to have
no ICU beds, a command center learns about a delayed transfer only when
someone calls in, and a mass-casualty scene has no single shared picture of
who's headed where. Life-Line puts every stakeholder — responder, sending
hospital, destination hospital, police, traffic control, command — on one
live-synced state, with AI doing the parts a human shouldn't have to do
manually under pressure: triaging a new case from a spoken or typed
description, and summarizing the whole board into a briefing a commander can
read in five seconds.

## What's actually AI here (and what isn't)

| Feature | Real or simulated |
|---|---|
| AI Triage (priority/dept/equipment from clinical notes) | **Real Claude API call** when `LIFELINE_ANTHROPIC_KEY` is set; transparent offline keyword heuristic otherwise — never silently fakes a result |
| AI Situation Report (command briefing) | Same pattern — real Claude call or honest heuristic fallback |
| Voice input for triage notes | Real (browser Web Speech API), no server round-trip |
| Destination recommendation / ETA prediction | Rule-based scoring (distance, specialty match, bed count) — not AI, always heuristic |
| SMS/WhatsApp dispatch | Simulated unless Twilio credentials are configured — status shown honestly per message |
| Hospital bed counts | Simulated demo data for Mumbai-area hospitals |

## Demo & Screenshots

| Responder | Command center |
|---|---|
| ![Command Center dashboard](docs/screenshots/command-center.png) | ![AI Triage suggestion](docs/screenshots/ai-triage.png) |

| AI Situation Report | Blood Bank  |
|---|---|
| ![AI Situation Report](docs/screenshots/situation-report.png) | ![Live operations map](docs/screenshots/live-map.png) |

## Installation

### Prerequisites

| Requirement | Notes |
|---|---|
| [Python 3.8+](https://www.python.org/downloads/) | The **only** dependency — the server uses the standard library alone. Nothing to `pip install`. |
| A modern browser | Chrome, Edge or Firefox recommended (PWA install + service worker need one of these). |

Check your Python version:

```bash
python --version        # Windows (or: py -3 --version)
python3 --version       # Linux / macOS
```

### 1. Clone the repository

```bash
git clone https://github.com/kukrejaagirish/lifeline.git
cd lifeline
```

*(No git? Click **Code → Download ZIP** on GitHub and unzip it instead.)*

### 2. Start the server

**Windows**

```bat
start.bat
:: or manually:
python server.py
```

**Linux / macOS**

```bash
python3 server.py
```

On first run the server creates `data/lifeline.db`, seeds demo hospitals,
units and cases, and prints a startup banner. That's the whole install —
no virtualenv, no package manager, no build step.

### 3. Open the app

Browse to **http://127.0.0.1:8787** and pick a role:

- **Responder** (`AMB-1024`) — ambulance crew view: claim runs, advance status
- **Command Center** — full coordination dashboard: create cases, assign units,
  declare MCI incidents, export CSV reports

Open more tabs — even on other devices on your network via
`http://<your-ip>:8787` — and watch every action sync in real time.
Deep-link a role directly: `http://127.0.0.1:8787/#responder/AMB-1024`.

### No Python? Try the offline demo

Open `public/index.html` directly in a browser — the app detects the missing
server and runs in **offline demo mode** (mock data, synced across tabs of that
browser only). The app is also a **PWA**: once served over HTTP you can install
it, and the static shell keeps working without a connection (the API always
requires the network).

### Troubleshooting

| Problem | Fix |
|---|---|
| `python is not recognized` | Install Python and tick *Add to PATH*, or use `py -3 server.py` on Windows. |
| Port already in use | `python server.py --port 8788` (then open `:8788`). |
| Badge says OFFLINE DEMO | The page can't reach the server — make sure `server.py` is running and you're using the right host/port. |
| Want a clean slate | Stop the server, delete `data/lifeline.db`, restart (or run with `--fresh`). |

### Optional: real SMS / WhatsApp

Out of the box, SMS/WhatsApp dispatch is **simulated** and labelled as such.
To send real messages through Twilio, see
[Enabling real SMS / WhatsApp](#enabling-real-sms--whatsapp-twilio) below —
it's a three-line `.env` file.

## What's new in v3

### Backend (`server.py` — zero dependencies)

| Capability | Details |
|---|---|
| SQLite persistence | Write-through to `data/lifeline.db`; legacy `state.json` auto-imported |
| SLA watchdog | REGISTERED cases older than threshold auto-escalate + notify; transfers exceeding ETA flagged DELAYED (always-on, even with `--no-sim`) |
| Notifications log | SMS/WhatsApp/radio dispatch per event; **simulated** unless Twilio env vars set — status shown honestly per message |
| Smart recommendations | `GET /api/recommend` scores hospitals by specialty match, free ICU beds and distance |
| ETA prediction | `GET /api/predict` returns historical average duration for a route/priority |
| **AI Triage** | `POST /api/triage` — Claude-powered (or heuristic fallback) priority/dept/tag suggestion from free-text notes |
| **AI Situation Report** | `GET /api/situation-report` — one-tap command briefing from live case & bed data |
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

- **AI Triage box** in the New Transfer form: free-text (or spoken, via mic
  button + Web Speech API) clinical notes → suggested priority, department,
  equipment tags and age
- **AI Situation Report** button on the Command Center: one tap generates a
  short live briefing of active load, delays, bed pressure and open incidents
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
| `LIFELINE_ANTHROPIC_KEY` | — | Enable real AI Triage & Situation Report via Claude. Without it, both features run an offline keyword/template heuristic and clearly report `"mode": "heuristic"` in their response. |
| `LIFELINE_ANTHROPIC_MODEL` | `claude-sonnet-5` | Override the model used for AI Triage / Situation Report. |
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
| GET | `/api/situation-report` | state_read | AI/heuristic command briefing from live case & bed data |
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
| POST | `/api/triage` | sending, responder, command | `{notes}` — AI/heuristic priority, department, tags, age suggestion |
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
