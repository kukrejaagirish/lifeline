# Changelog

## 3.4 — 2026-10-26 (audit and polish)

An audit of v3.3 found 30 issues: 1 critical, 6 high, 13 medium, 10 low. All are fixed below. Every server-side fix is covered by the test suite, which grew from 29 tests (1 failing) to 66 (all passing). The suite runs three times in a row from a fresh database, with identical results. Front-end fixes are checked in a real headless browser.

### Added

- **Raspberry Pi IoT kit.** POST /api/iot/telemetry (per-device keys, range validation, replay protection, rate limit) plus GET/POST /api/iot/devices. Vitals attach to the ambulance's active case. Abnormal readings alert Command and the destination hospital, PANIC raises the case to CRITICAL, and ARRIVED closes the run. IoT updates reach screens as light `telemetry` SSE events.
- `iot/pi_agent.py` (runs on the Pi: GPS, MAX30102, DS18B20, buttons, RC522, store-and-forward buffer), `iot/iot_simulator.py` (six scenarios), a systemd unit and an env template.
- "Live vitals (IoT)" row on the case screen, with an alert line.
- PIN field on the sign-in screen, and an instant sign-out notice when the same ID signs in elsewhere.
- GET /api/session, `--seed-demo`, Dockerfile, docs/DEPLOY.md, a byte-compile step in CI.
- 37 new tests: sign-in rules, sessions, strict mode, ownership, privacy, input types, triage, log redaction, every IoT answer, the simulator.

### Fixed (most severe first)

- **C1 · Critical · Sign-in** — Sign-in checked nothing. Any role, Admin and Command Center included, with any operator ID or a blank one, got a working token. The users table was never consulted by /api/login. → Operator ID required and bound to one role. Command Center and Admin need a PIN (PBKDF2-SHA256, salted). 5 wrong PINs lock the ID for 5 minutes. Strict mode (LIFELINE_OPEN_LOGIN=0) admits only registered IDs.
- **H1 · High · Sign-in / CI** — A blank operator ID was accepted, so the repo's own test test_missing_operator_id_rejected fails: 28 of 29 pass and the GitHub Actions badge is red. → Blank ID returns 400. The repo's test passes again, along with 37 new ones.
- **H2 · High · Sessions** — The same ID could be logged in any number of times: 5 simultaneous logins as AMB-1026 gave 5 live tokens, and nobody was told. → One live session per operator ID. A new sign-in signs the older one out at once (401 session_replaced). Its screen returns to sign-in with the reason. LIFELINE_SINGLE_SESSION=0 turns this off.
- **H3 · High · Sign-in** — An ID could switch role: AMB-1024 could sign in as Command Center. → 403 role_mismatch: "Operator ID AMB-1024 is registered as Responder, not Command Center."
- **H4 · High · Permissions** — Any responder could advance or hand over another ambulance's run. The UI hid the button, but the API never checked. → 403 not_your_run unless the case is assigned to the caller's unit.
- **H5 · High · Privacy** — Police, traffic control and patient attendants received every patient's age, diagnosis and notes through /api/state and the live stream. → Role-filtered snapshots: clinical fields are removed for those roles, on REST and SSE alike.
- **H6 · High · Front end** — From the second visit on, the service worker broke the Leaflet map, the jsPDF export and the web fonts. Its fetch() of CDN files was blocked by the page's CSP (connect-src 'self'). → The worker only proxies known CDN hosts, and the CSP allows them. Re-tested in a real browser: map and PDF library load, 0 console errors.
- **M1 · Medium · Validation** — Non-text JSON values crashed the server with 500 Internal error (for example "origin": 12345 raised AttributeError). → Every text field is type-checked. Requests now get a 400 with a plain message.
- **M2 · Medium · Validation** — Destination was not validated: a transfer to "Imaginary Hospital" was accepted, with no bed reserved. → Destination must be a known hospital. The name is normalised to its canonical spelling, so the bed reservation works.
- **M3 · Medium · Secrets** — Session tokens were written to the server log, because the live-sync URL carries ?token=. → Tokens are redacted in the log (token=***). A test checks this.
- **M4 · Medium · Sessions** — Logged-out, expired or unknown tokens got 403 "Your role cannot perform this action", which is misleading and left the UI no way to recover. → 401 with a code (sign_in_required, session_expired, signed_out, session_replaced, session_invalid). 403 now only means a live session lacks the permission.
- **M5 · Medium · Front end** — After a server restart the UI looped "RECONNECTING…" on a dead token and never went back to sign-in. → The client checks /api/session and returns to sign-in with the server's reason. A pushed 'session' event does the same instantly.
- **M6 · Medium · Performance** — With Twilio configured, SMS/WhatsApp calls ran inside the global lock: up to 3 × 4 s, so every screen could freeze for 12 s on each new case. → Messages are queued and sent by a background worker. Their status is updated in place when the send finishes.
- **M7 · Medium · Performance** — Every change re-sent every case ever created to every screen, so the payload grew without limit. → Snapshots carry the active cases plus the 100 most recent closed ones. The CSV report still has everything.
- **M8 · Medium · Front end** — The service worker served the app's own files cache-first with a fixed version, so a deployed fix never reached users who had visited before. → Own files are network-first with an offline fallback. Cache version bumped to v3.4.
- **M9 · Medium · AI triage** — The offline triage heuristic matched substrings: "stable" read as stab wound, "uncertain" as RTA, "heartburn" as heart, and "laboured breathing" as labour (obstetric). One routine note came back as urgent Cardiac ICU with Blood and Spinal Board tags. → Whole-word matching with explicit stems. The routine note is now correctly 'priority / Emergency / no tags'.
- **M12 · Medium · Front end** — The AI situation report disappeared within seconds. Every live update re-rendered the dashboard with the report hidden, and with the simulation on that meant every 5 s. The labels also credited "Claude", though the code calls Groq. → The last report is kept and re-drawn with its time. Labels now name the real provider and say honestly when the keyword heuristic answered.
- **M13 · Medium · Offline demo** — The in-browser triage used by the Vercel demo had the same substring false positives as the server heuristic. → Ported the whole-word matcher to JavaScript. Same answers as the server, checked on 5 sample notes.
- **M10 · Medium · Config** — LIFELINE_ALLOW_PUBLIC_REGISTRATION=1 made /api/users/register crash with 500 (uncaught PermissionError), and /api/health always reported false. → Registration is admin-only, and permission errors map to 403. The broken flag is gone.
- **M11 · Medium · Security** — The CSP allowed inline scripts ('unsafe-inline'), and jsPDF loaded from a CDN with no integrity hash. → 'unsafe-inline' is removed from script-src (the one inline handler was rewritten), and an SRI hash is added for jsPDF.
- **L1 · Low · Data** — A rejected request (unknown incident) still used up a case number, leaving a gap: …1029 → …1031. → Everything is validated before a number is taken.
- **L2 · Low · API** — A malformed JSON body echoed Python's parser message. → "Invalid JSON body."
- **L3 · Low · Workflow** — The handover checklist could be ticked on a cancelled case. → 400 "Case is cancelled".
- **L4 · Low · Ops** — If the port was busy the server waited on input(), which hangs a headless Pi or systemd boot. → It only waits when a console is attached.
- **L5 · Low · Data** — The simulated ETA countdown was not saved, so a restart reset the ETAs. → Saved on each tick.
- **L6 · Low · Demo** — SEED_CASES was dead code: the README promised seeded cases but the board started empty. → --seed-demo puts four sample transfers on the board (start.bat uses it).
- **L7 · Low · Map** — Destination coordinates were derived from the hospital's name rather than its area, so many pins fell near the city centre. → Coordinates come from the hospital's area.
- **L8 · Low · Tests** — The test harness leaked server processes when setUpClass failed, and server output went to a pipe nobody read, which can block the server. → Class cleanups replace tearDown, and output goes to a log file. No orphan processes are left after a run.
- **L9 · Low · Docs** — Several docs did not match the code. The README said Claude / LIFELINE_ANTHROPIC_KEY, but the code uses Groq. The CLI flags were wrong (--tls --cert), it pointed to a ROUTES table that does not exist, and the dispatch endpoint was missing. Two README screenshots showed the wrong screen (live-map.png is the blood bank; situation-report.png is the new-transfer form). It claimed "secure authentication by default", and .env.example named the wrong default model. → README, .env.example and SECURITY.md rewritten to match the code, with 10 fresh v3.4 screenshots. DEPLOY.md and a Dockerfile added.
- **L10 · Low · Repo** — .gitignore had ".dev-notes.md" in literal quotes, so the file was never ignored. → Fixed.

### Changed behaviour (read before upgrading)

- Operator ID is now required. Command Center and Admin need a PIN: demo PIN `1234` for CMD-01 and ADMIN-001 (`LIFELINE_DEMO_PIN`).
- Signing in again with the same ID signs the earlier session out.
- 401 means no live session and 403 means the role is not allowed. v3.3 returned 403 for a bad token.
- A destination must be a hospital from the list.
- Police, traffic and attendant views no longer contain clinical fields.
- `LIFELINE_ALLOW_PUBLIC_REGISTRATION` is removed (it never worked).
