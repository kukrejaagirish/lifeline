import io

path = "server.py"
with io.open(path, "r", encoding="utf-8") as f:
    src = f.read()

applied = []
skipped = []

# Fix 1: rate_prune function
anchor1 = '        return b[1] <= RATE_LIMIT\n\n\n# ' + '-' * 76 + '\n# Store'
if "def rate_prune" in src:
    skipped.append("rate_prune function")
elif anchor1 in src:
    replacement1 = (
        '        return b[1] <= RATE_LIMIT\n\n\n'
        'def rate_prune():\n'
        '    """Drop IP buckets from previous minutes so RL_BUCKETS does not grow\n'
        '    without bound over a long-running server (many distinct client IPs)."""\n'
        '    with RL_LOCK:\n'
        '        w = int(time.time() // 60)\n'
        '        stale = [ip for ip, b in RL_BUCKETS.items() if b[0] != w]\n'
        '        for ip in stale:\n'
        '            del RL_BUCKETS[ip]\n\n\n'
        '# ' + '-' * 76 + '\n# Store'
    )
    src = src.replace(anchor1, replacement1, 1)
    applied.append("rate_prune function")
else:
    skipped.append("rate_prune function (anchor not found)")

# Fix 2: call rate_prune in maintenance_loop
anchor2 = "        try:\n            changed = False\n            with STORE.lock:\n                STORE.purge_tokens()"
if "rate_prune()\n            changed = False" in src:
    skipped.append("rate_prune call in maintenance_loop")
elif anchor2 in src:
    replacement2 = "        try:\n            rate_prune()\n            changed = False\n            with STORE.lock:\n                STORE.purge_tokens()"
    src = src.replace(anchor2, replacement2, 1)
    applied.append("rate_prune call in maintenance_loop")
else:
    skipped.append("rate_prune call in maintenance_loop (anchor not found)")

# Fix 3: age type normalization
anchor3 = '        c["tags"] = json.loads(c["tags"] or "[]")\n        c["handover"] = json.loads(c["handover"] or "{}")\n        c["delayed"] = bool(c["delayed"])'
if 'age is stored as TEXT' in src:
    skipped.append("age type normalization")
elif anchor3 in src:
    replacement3 = (
        '        c["tags"] = json.loads(c["tags"] or "[]")\n'
        '        c["handover"] = json.loads(c["handover"] or "{}")\n'
        '        if isinstance(c["age"], str) and c["age"].isdigit():\n'
        '            c["age"] = int(c["age"])\n'
        '        c["delayed"] = bool(c["delayed"])'
    )
    src = src.replace(anchor3, replacement3, 1)
    applied.append("age type normalization")
else:
    skipped.append("age type normalization (anchor not found)")

# Fix 4: GET exception message leak
anchor4 = '        except Exception as e:\n            try:\n                self._error(500, f"Internal error: {e}")\n            except Exception:\n                self.close_connection = True\n\n    def _report_csv'
if anchor4 in src:
    replacement4 = (
        '        except Exception as e:\n'
        '            print(f"[server] GET {self.path} failed: {e!r}", flush=True)\n'
        '            try:\n'
        '                self._error(500, "Internal error.")\n'
        '            except Exception:\n'
        '                self.close_connection = True\n\n    def _report_csv'
    )
    src = src.replace(anchor4, replacement4, 1)
    applied.append("GET error message fix")
else:
    skipped.append("GET error message fix (already applied or anchor not found)")

# Fix 5: POST exception message leak
anchor5 = '        except Exception as e:\n            try:\n                self._error(500, f"Internal error: {e}")\n            except Exception:\n                self.close_connection = True\n\n    # ---- SSE ----'
if anchor5 in src:
    replacement5 = (
        '        except Exception as e:\n'
        '            print(f"[server] POST {self.path} failed: {e!r}", flush=True)\n'
        '            try:\n'
        '                self._error(500, "Internal error.")\n'
        '            except Exception:\n'
        '                self.close_connection = True\n\n    # ---- SSE ----'
    )
    src = src.replace(anchor5, replacement5, 1)
    applied.append("POST error message fix")
else:
    skipped.append("POST error message fix (already applied or anchor not found)")

# Fix 6: path traversal
anchor6 = '        if not safe.startswith(PUBLIC_DIR) or not os.path.isfile(safe):'
if anchor6 in src:
    replacement6 = (
        '        if not (safe == PUBLIC_DIR or safe.startswith(PUBLIC_DIR + os.sep)) \\\n'
        '                or not os.path.isfile(safe):'
    )
    src = src.replace(anchor6, replacement6, 1)
    applied.append("path traversal fix")
else:
    skipped.append("path traversal fix (already applied or anchor not found)")

# Fix 7: atexit shutdown cleanup
anchor7 = '    atexit.register(lambda: None)  # sqlite commits are synchronous already'
if anchor7 in src:
    replacement7 = (
        '    def _close_db():\n'
        '        try:\n'
        '            with STORE.lock:\n'
        '                if STORE.dirty:\n'
        '                    STORE.set_meta("rev", STORE.rev)\n'
        '                    STORE.dirty = False\n'
        '                STORE.db.close()\n'
        '        except Exception:\n'
        '            pass\n\n'
        '    atexit.register(_close_db)'
    )
    src = src.replace(anchor7, replacement7, 1)
    applied.append("atexit shutdown cleanup")
else:
    skipped.append("atexit shutdown cleanup (already applied or anchor not found)")

with io.open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(src)

print("APPLIED:")
for a in applied:
    print("  -", a)
print("SKIPPED:")
for s in skipped:
    print("  -", s)