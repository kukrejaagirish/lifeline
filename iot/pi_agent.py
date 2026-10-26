#!/usr/bin/env python3
"""
Life-Line ambulance kit — runs on a Raspberry Pi 4 Model B inside the
ambulance and reports GPS, patient vitals and two buttons to the Life-Line
server every 5 s (POST /api/iot/telemetry).

Hardware (see the IoT report for wiring):
  * GPS        u-blox NEO-6M / NEO-M8N on the UART (/dev/serial0, 9600 baud)
  * SpO2 + HR  MAX30102 pulse oximeter on I2C bus 1 (address 0x57)
  * Body temp  DS18B20 probe on 1-Wire (GPIO4, 4.7 kΩ pull-up)
  * Buttons    PANIC on GPIO17, ARRIVED on GPIO27 (to GND, internal pull-up)
  * Optional   RC522 RFID reader on SPI0 for the patient wristband tag
  * Status LED GPIO22 (green = last reading accepted, blinking = buffering)

Install on Raspberry Pi OS (Bookworm, 64-bit):
    sudo raspi-config  # Interface Options → enable Serial (no login shell), I2C, 1-Wire, SPI
    python3 -m venv ~/ll && ~/ll/bin/pip install pyserial pynmea2 smbus2 gpiozero mfrc522
    cp lifeline-kit.env.example /etc/lifeline-kit.env   # server URL, device id, key
    sudo cp lifeline-kit.service /etc/systemd/system/ && sudo systemctl enable --now lifeline-kit

Every sensor is optional: a missing or failing sensor is simply left out of
the reading, so the kit keeps reporting whatever still works. Readings that
cannot be delivered (no 4G signal in a tunnel) are buffered on the SD card
and replayed in order when the link comes back.
"""
import json
import os
import queue
import threading
import time
import urllib.error
import urllib.request

SERVER = os.environ.get("LIFELINE_SERVER", "https://lifeline.example.org")
DEVICE_ID = os.environ.get("LIFELINE_DEVICE_ID", "PI-AMB-1024")
DEVICE_KEY = os.environ.get("LIFELINE_DEVICE_KEY", "")
INTERVAL_S = float(os.environ.get("LIFELINE_INTERVAL_S", "5"))
STATE_DIR = os.environ.get("LIFELINE_STATE_DIR", "/var/lib/lifeline-kit")
BUFFER_FILE = os.path.join(STATE_DIR, "buffer.jsonl")
SEQ_FILE = os.path.join(STATE_DIR, "seq")
MAX_BUFFER = 5000

events = queue.Queue()          # button presses from GPIO callbacks


# ---------------------------------------------------------------- sensors
class GPS:
    def __init__(self, port="/dev/serial0"):
        import serial          # pyserial
        import pynmea2
        self._nmea = pynmea2
        self.ser = serial.Serial(port, 9600, timeout=1)
        self.fix = None
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        while True:
            try:
                line = self.ser.readline().decode("ascii", "ignore").strip()
                if line.startswith(("$GPRMC", "$GNRMC")):
                    m = self._nmea.parse(line)
                    if m.status == "A":             # valid fix
                        self.fix = {"lat": round(m.latitude, 6), "lng": round(m.longitude, 6),
                                    "speed_kmh": round((m.spd_over_grnd or 0) * 1.852, 1)}
            except Exception:
                time.sleep(0.5)

    def read(self):
        return self.fix


class PulseOx:
    """MAX30102 over I2C. Raw red/IR samples → SpO2 and heart rate using
    the ratio-of-ratios method (good enough for a demo, NOT a medical device)."""
    ADDR = 0x57

    def __init__(self, bus=1):
        from smbus2 import SMBus
        self.bus = SMBus(bus)
        self.bus.write_byte_data(self.ADDR, 0x09, 0x40)   # reset
        time.sleep(0.1)
        self.bus.write_byte_data(self.ADDR, 0x09, 0x03)   # SpO2 mode
        self.bus.write_byte_data(self.ADDR, 0x0A, 0x27)   # 100 sps, 411 µs, 4096 nA
        self.bus.write_byte_data(self.ADDR, 0x0C, 0x24)   # LED1 (red) current
        self.bus.write_byte_data(self.ADDR, 0x0D, 0x24)   # LED2 (IR) current

    def _sample(self):
        d = self.bus.read_i2c_block_data(self.ADDR, 0x07, 6)
        red = ((d[0] << 16) | (d[1] << 8) | d[2]) & 0x3FFFF
        ir = ((d[3] << 16) | (d[4] << 8) | d[5]) & 0x3FFFF
        return red, ir

    def read(self, seconds=4, rate=100):
        red, ir = [], []
        for _ in range(int(seconds * rate)):
            r, i = self._sample()
            red.append(r)
            ir.append(i)
            time.sleep(1 / rate)
        if sum(ir) / len(ir) < 50000:          # no finger on the sensor
            return None
        def ac_dc(x):
            m = sum(x) / len(x)
            return (max(x) - min(x)) / 2, m
        ac_r, dc_r = ac_dc(red)
        ac_i, dc_i = ac_dc(ir)
        ratio = (ac_r / dc_r) / (ac_i / dc_i)
        spo2 = max(70, min(100, round(110 - 25 * ratio)))
        m = sum(ir) / len(ir)                  # beats = upward mean crossings
        beats = sum(1 for a, b in zip(ir, ir[1:]) if a < m <= b)
        hr = round(beats * 60 / seconds)
        return {"spo2": spo2, "hr": hr} if 30 <= hr <= 220 else {"spo2": spo2}


class BodyTemp:
    def __init__(self):
        import glob
        devs = glob.glob("/sys/bus/w1/devices/28-*/w1_slave")
        if not devs:
            raise RuntimeError("no DS18B20 on 1-Wire")
        self.path = devs[0]

    def read(self):
        with open(self.path) as fh:
            lines = fh.read().splitlines()
        if not lines or not lines[0].endswith("YES"):
            return None
        return round(int(lines[1].split("t=")[1]) / 1000.0, 1)


class Rfid:
    def __init__(self):
        from mfrc522 import SimpleMFRC522
        self.reader = SimpleMFRC522()
        self.last = None
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        while True:
            try:
                uid, _ = self.reader.read()     # blocks until a tag is held
                self.last = format(uid, "X")
            except Exception:
                time.sleep(1)


def try_make(cls, name):
    try:
        s = cls()
        print(f"[kit] {name}: ok", flush=True)
        return s
    except Exception as e:
        print(f"[kit] {name}: not available ({e}) — continuing without it", flush=True)
        return None


def setup_buttons():
    try:
        from gpiozero import Button, LED
        panic = Button(17, pull_up=True, bounce_time=0.2, hold_time=1.0)
        arrived = Button(27, pull_up=True, bounce_time=0.2)
        panic.when_held = lambda: events.put("panic")      # hold 1 s: no accidental panics
        arrived.when_pressed = lambda: events.put("arrived")
        return LED(22), (panic, arrived)
    except Exception as e:
        print(f"[kit] buttons/LED: not available ({e})", flush=True)
        return None, None


# ---------------------------------------------------------------- transport
def next_seq():
    os.makedirs(STATE_DIR, exist_ok=True)
    try:
        n = int(open(SEQ_FILE).read().strip()) + 1
    except (OSError, ValueError):
        n = int(time.time())
    with open(SEQ_FILE, "w") as fh:
        fh.write(str(n))
    return n


def send(body):
    req = urllib.request.Request(SERVER.rstrip("/") + "/api/iot/telemetry",
                                 data=json.dumps(body).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Device-Key", DEVICE_KEY)
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}
    except (urllib.error.URLError, OSError):
        return 0, {}


def buffer_append(body):
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(BUFFER_FILE, "a") as fh:
        fh.write(json.dumps(body) + "\n")


def buffer_flush():
    """Replay buffered readings oldest-first; stop at the first network failure."""
    if not os.path.exists(BUFFER_FILE):
        return True
    lines = open(BUFFER_FILE).read().splitlines()[-MAX_BUFFER:]
    keep = []
    for i, line in enumerate(lines):
        status, _ = send(json.loads(line))
        if status == 0:
            keep = lines[i:]
            break
        if status == 429:
            time.sleep(1)
            keep = lines[i:]
            break
        # 202 delivered · 400/409 will never succeed → drop
    with open(BUFFER_FILE, "w") as fh:
        fh.write("\n".join(keep) + ("\n" if keep else ""))
    return not keep


def main():
    if not DEVICE_KEY:
        raise SystemExit("Set LIFELINE_DEVICE_KEY (from POST /api/iot/devices).")
    gps = try_make(GPS, "GPS")
    pox = try_make(PulseOx, "MAX30102")
    tmp = try_make(BodyTemp, "DS18B20")
    rfid = try_make(Rfid, "RC522")
    led, _buttons = setup_buttons()
    print(f"[kit] {DEVICE_ID} → {SERVER} every {INTERVAL_S:g} s", flush=True)
    interval = INTERVAL_S
    while True:
        t0 = time.time()
        body = {"device_id": DEVICE_ID, "seq": next_seq(),
                "ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "button": "none"}
        try:
            body["button"] = events.get_nowait()
        except queue.Empty:
            pass
        fix = gps.read() if gps else None
        if fix:
            body["gps"] = fix
        vit = {}
        if pox:
            vit.update(pox.read() or {})
        if tmp:
            t = tmp.read()
            if t is not None:
                vit["temp_c"] = t
        if vit:
            body["vitals"] = vit
        if rfid and rfid.last:
            body["patient_tag"] = rfid.last
        online = buffer_flush()
        status, resp = send(body) if online else (0, {})
        if status == 202:
            interval = float(resp.get("next_interval_s") or INTERVAL_S)
            if led:
                led.on()
            for a in resp.get("alerts", []):
                print(f"[kit] ALERT acknowledged by server: {a}", flush=True)
        elif status in (0, 429):
            buffer_append(body)                 # no signal / slow down: keep it, replay later
            if led:
                led.blink(0.2, 0.2)
        elif status == 401:
            print("[kit] server rejected the device key — check LIFELINE_DEVICE_KEY", flush=True)
            if led:
                led.off()
        else:
            print(f"[kit] server answered {status}: {resp}", flush=True)
        time.sleep(max(0.5, interval - (time.time() - t0)))


if __name__ == "__main__":
    main()
