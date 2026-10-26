# Deploying Life-Line

## Where it can run

| Host | Works? | Why |
|---|---|---|
| Vercel / Netlify / GitHub Pages | Offline demo only | Static hosting; no long-running Python process, no SSE, no SQLite file. The UI falls back to its in-browser mock. |
| Render, Railway, Fly.io | Yes | Long-running process + a persistent disk for `data/lifeline.db`. |
| Any VPS (₹400–800/month) | Yes | `systemd` + Caddy/Nginx for HTTPS. |
| Raspberry Pi 4/5 at the hospital or control room | Yes | Same as a VPS; expose through Cloudflare Tunnel or Tailscale for HTTPS. |

## Docker

```bash
docker build -t lifeline .
docker run -p 8787:8787 -v lifeline-data:/app/data -e LIFELINE_DEMO_PIN=4826 lifeline
```

## Production checklist

1. `LIFELINE_OPEN_LOGIN=0`, a non-default `LIFELINE_DEMO_PIN`, register real operator IDs as admin.
2. HTTPS (`--certfile/--keyfile`, or a reverse proxy). Behind a proxy, all clients share one IP for the rate limiter.
3. `--no-sim` (the simulation moves ETAs and traffic on its own).
4. Back up `data/lifeline.db` (SQLite) — e.g. a nightly `sqlite3 data/lifeline.db ".backup backup.db"`.
5. Register each Pi with `POST /api/iot/devices` (admin) and put the returned key in `/etc/lifeline-kit.env`.

## Raspberry Pi kit service

```bash
sudo cp iot/lifeline-kit.env.example /etc/lifeline-kit.env   # fill in server URL, device id, key
sudo cp iot/lifeline-kit.service /etc/systemd/system/
sudo systemctl enable --now lifeline-kit
journalctl -u lifeline-kit -f
```
