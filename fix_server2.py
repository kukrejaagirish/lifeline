import io

path = "server.py"
with io.open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

if any("def rate_prune" in l for l in lines):
    print("SKIPPED: rate_prune function already present")
else:
    target_idx = None
    for i, l in enumerate(lines):
        if "return b[1] <= RATE_LIMIT" in l:
            target_idx = i
            break

    if target_idx is None:
        print("FAILED: could not find anchor line 'return b[1] <= RATE_LIMIT'")
    else:
        new_func_lines = [
            "\n",
            "\n",
            "def rate_prune():\n",
            '    """Drop IP buckets from previous minutes so RL_BUCKETS does not grow\n',
            '    without bound over a long-running server (many distinct client IPs)."""\n',
            "    with RL_LOCK:\n",
            "        w = int(time.time() // 60)\n",
            "        stale = [ip for ip, b in RL_BUCKETS.items() if b[0] != w]\n",
            "        for ip in stale:\n",
            "            del RL_BUCKETS[ip]\n",
        ]
        lines[target_idx+1:target_idx+1] = new_func_lines
        with io.open(path, "w", encoding="utf-8", newline="\n") as f:
            f.writelines(lines)
        print("APPLIED: rate_prune function inserted after line", target_idx + 1)