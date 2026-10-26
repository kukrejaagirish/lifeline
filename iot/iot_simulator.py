#!/usr/bin/env python3
"""
Life-Line IoT simulator — behaves like the Raspberry Pi ambulance kit
(iot/pi_agent.py) without any hardware, so the ingest API can be demoed and
tested anywhere. Standard library only.

    python iot/iot_simulator.py                       # 10 readings, normal run
    python iot/iot_simulator.py --scenario deteriorate --count 12
    python iot/iot_simulator.py --scenario panic
    python iot/iot_simulator.py --scenario arrive
    python iot/iot_simulator.py --scenario bad-data   # expect 400
    python iot/iot_simulator.py --scenario unknown-device   # expect 401

Each reading is POSTed to /api/iot/telemetry with the X-Device-Key header and
the server's JSON answer is printed. Exit code 0 when every answer matched
what the scenario expects.
"""
import argparse
import json
import math
import random
import sys
import time
import urllib.error
import urllib.request

# Kalyan → Bombay Hospital (the seeded STEMI transfer handled by AMB-1024)
ROUTE = [(19.2437, 73.1355), (19.1860, 73.0400), (19.0700, 72.9300),
         (19.0000, 72.8600), (18.9500, 72.8300), (18.9410, 72.8270)]


def point_on_route(f):
    f = max(0.0, min(1.0, f)) * (len(ROUTE) - 1)
    i = min(int(f), len(ROUTE) - 2)
    t = f - i
    (a1, b1), (a2, b2) = ROUTE[i], ROUTE[i + 1]
    return a1 + (a2 - a1) * t, b1 + (b2 - b1) * t


def reading(n, total, scenario, rng):
    lat, lng = point_on_route(n / max(1, total - 1))
    spo2, hr, temp = 97 - rng.random() * 1.5, 86 + rng.gauss(0, 3), 36.8 + rng.gauss(0, 0.1)
    if scenario == "deteriorate":          # SpO2 slides below 90, HR climbs
        k = n / max(1, total - 1)
        spo2 -= 11 * k
        hr += 50 * k
    body = {"seq": None, "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "gps": {"lat": round(lat, 6), "lng": round(lng, 6),
                    "speed_kmh": round(35 + 20 * abs(math.sin(n)), 1)},
            "vitals": {"spo2": round(spo2), "hr": round(hr), "temp_c": round(temp, 1)},
            "button": "none"}
    if scenario == "panic" and n == total // 2:
        body["button"] = "panic"
    if scenario == "arrive" and n == total - 1:
        body["button"] = "arrived"
    if scenario == "bad-data":
        body["gps"] = {"lat": 123.4, "lng": "east"}
        body["vitals"] = {"spo2": 140, "hr": -5}
    return body


def post(server, device_id, key, body, timeout=6):
    data = json.dumps(dict(body, device_id=device_id)).encode()
    req = urllib.request.Request(server.rstrip("/") + "/api/iot/telemetry", data=data,
                                 method="POST")
    req.add_header("Content-Type", "application/json")
    if key:
        req.add_header("X-Device-Key", key)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}
    except (urllib.error.URLError, OSError) as e:
        return 0, {"error": f"server unreachable: {e}"}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--server", default="http://127.0.0.1:8787")
    ap.add_argument("--device-id", default="PI-AMB-1024")
    ap.add_argument("--key", default="demo-pi-key-1024")
    ap.add_argument("--count", type=int, default=10)
    ap.add_argument("--interval", type=float, default=5.0, help="seconds between readings")
    ap.add_argument("--start-seq", type=int, default=int(time.time()))
    ap.add_argument("--scenario", default="normal",
                    choices=["normal", "deteriorate", "panic", "arrive", "bad-data",
                             "unknown-device"])
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--json", action="store_true", help="print one JSON line per reading")
    a = ap.parse_args(argv)
    rng = random.Random(a.seed)
    device, key = a.device_id, a.key
    expect = 202
    if a.scenario == "bad-data":
        expect, a.count = 400, 1
    if a.scenario == "unknown-device":
        expect, a.count, device, key = 401, 1, "PI-GHOST-1", "not-a-key"
    ok = True
    for n in range(a.count):
        body = reading(n, a.count, a.scenario, rng)
        body["seq"] = a.start_seq + n
        status, resp = post(a.server, device, key, body)
        if status == 429:              # server asks us to slow down: wait, retry once
            time.sleep(max(0.6, a.interval))
            status, resp = post(a.server, device, key, body)
        good = status == expect
        ok &= good
        if a.json:
            print(json.dumps({"n": n + 1, "sent": body, "status": status, "response": resp}))
        else:
            v = body.get("vitals", {})
            print(f"[{n + 1}/{a.count}] {device} seq={body['seq']} "
                  f"SpO2={v.get('spo2')} HR={v.get('hr')} btn={body['button']} "
                  f"→ {status} {json.dumps(resp, ensure_ascii=False)}")
        if status == 0:
            print("  (server unreachable — the Pi agent would buffer this reading and retry)")
        if n < a.count - 1:
            time.sleep(a.interval)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
