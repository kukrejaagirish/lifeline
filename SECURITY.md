# Life-Line Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 3.x | Yes |
| < 3.0 | No |

## Default security posture

- Authentication uses short-lived server-side sessions tied to the operator ID and role.
- Public user registration is disabled by default.
- A default `ADMIN-001` admin identity is provisioned for demo/bootstrap use; production deployments should use an external identity provider.
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
