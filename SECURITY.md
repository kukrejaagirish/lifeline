# Life-Line Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 3.4+ | Yes |
| 3.0 – 3.3 | No — sign-in did not verify operators |
| < 3.0 | No |

## Default security posture

- Sign-in requires an operator ID; an ID is bound to one role and cannot switch roles.
- Command Center and Admin require a PIN (PBKDF2-SHA256, 120k iterations, per-user salt); 5 wrong PINs lock the ID for 5 minutes.
- One live session per operator ID: a new sign-in revokes the older session immediately (`session_replaced`).
- Strict mode (`LIFELINE_OPEN_LOGIN=0`) admits only admin-registered IDs. Open demo mode lets new non-privileged IDs self-register — do not expose open mode to the internet.
- Demo identities (`ADMIN-001`, `CMD-01`, PIN from `LIFELINE_DEMO_PIN`, default 1234) exist for bootstrap; change the PIN, and use an external identity provider for production.
- Police, traffic control and patient attendants receive role-filtered state with clinical fields removed.
- Responders can only advance or hand over their own runs.
- IoT devices authenticate with a per-device key (stored hashed); unknown device and wrong key get the same answer; replayed readings are refused.
- Session tokens never appear in the server log (the SSE URL is redacted).
- Session tokens are random, short-lived, and held server-side.
- State-changing POST requests are rate limited.
- API and static responses include defensive security headers.
- Hospital capacity is explicitly marked as simulated/unverified until a trusted integration is connected.
- External AI triage receives redacted common direct identifiers and is always marked as requiring human review.

## Production requirements

Life-Line is an emergency coordination prototype, not a certified medical device or emergency-services dispatch platform. Before real clinical use, independently validate security, privacy, reliability, clinical safety, disaster recovery, audit controls, and all external integrations.

For network deployments, terminate HTTPS with a trusted certificate. Do not expose an unauthenticated or demo-mode server to the public internet.

## Reporting a vulnerability

Please report suspected security vulnerabilities privately to the repository maintainers rather than opening a public issue containing exploit details. Include the affected version, endpoint/file, reproduction steps, and impact. Do not include real patient information in reports.
