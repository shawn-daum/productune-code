#!/usr/bin/env python3
"""Contrastive probe runner (T-1269, design T-1188).

Runs the same tasks under control / cand-a / cand-b / positive arms with
`claude -p`, counts a target behavior with a machine detector, and prints a
verdict table with resource columns next to the effect.

  probe.py PROBE.json --out DIR [--cwd WORKTREE] [--conc 4] [--maxt 30]
                      [--dry-run] [--prove-home-only]

probe.json
  purpose            one line, the user's words (the behavior the change aims at)
  arms               {name: spec}; name in control|cand-a|cand-b|positive
    spec.hook        {"event": "UserPromptSubmit", "text": "..."}  -> claude --settings
    spec.overlay     {"files": {"discipline/x.md": "/abs/source"}}   -> scratch PRDT_HOME
                     (keys: discipline/<path> or doctrine.md — any other key exits)
                     (give control an empty overlay {} when any arm uses one)
    spec.prompt_suffix  appended to the task text (positive arm)
  detector           {"rules": [{"all": [regex | {"re": regex, "min": n}, ...]}, ...]}
                     a run is a hit when any rule has all its patterns matched in the reply
  tasks              [{"id", "text"}]
  threshold          {"min_diff": n, "max_down": n}   (cand hits - control hits >= min_diff)
  budget_cap_usd     cumulative cost cap
  agent / tools      default prdt-po / Read,Grep,Glob
  forbid_files       basenames that must not exist under cwd/docs (isolation)

Stdlib only. Nothing is written outside --out and the scratch PRDT_HOME.
"""
import argparse, concurrent.futures as cf, glob, hashlib, json, os, re, shutil
import statistics as st, subprocess, sys, tempfile, threading, time
from datetime import datetime
from zoneinfo import ZoneInfo

ARM_ORDER = ["control", "cand-a", "cand-b", "positive"]
READ_ONLY = {"Read", "Grep", "Glob"}
MANIFEST = "PRE-RUN-MANIFEST.sha256"


def sha(b):
    return hashlib.sha256(b).hexdigest()


def canon(o):
    return json.dumps(o, ensure_ascii=False, sort_keys=True, indent=1).encode()


# ---------- manifest ----------
def manifest_lines(probe):
    items = [("tasks.json", canon(probe["tasks"])), ("detector.json", canon(probe["detector"])),
             ("arms.json", canon(probe["arms"])), ("threshold+budget.json",
                                                  canon({"threshold": probe.get("threshold"), "budget_cap_usd": probe.get("budget_cap_usd")}))]
    for name, a in probe["arms"].items():
        for rel, src in ((a.get("overlay") or {}).get("files") or {}).items():
            items.append((f"overlay:{name}:{rel}", open(src, "rb").read()))
    return [f"{sha(b)}  {n}" for n, b in items]


def write_manifest(out, probe_path, probe):
    lines = [f"{sha(open(probe_path,'rb').read())}  probe.json"] + manifest_lines(probe)
    p = os.path.join(out, MANIFEST)
    if os.path.exists(p):
        old = open(p).read().splitlines()
        if old[:len(lines)] != lines:
            sys.exit(f"manifest mismatch: {p} was written for a different probe — use a fresh --out")
        return p
    stamp = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%F %H:%M %Z")
    with open(p, "x") as f:
        f.write("\n".join(lines + [stamp]) + "\n")
    return p


# ---------- detector ----------
def hit(detector, text):
    for rule in detector["rules"]:
        ok = True
        for pat in rule["all"]:
            rx, mn = (pat, 1) if isinstance(pat, str) else (pat["re"], pat.get("min", 1))
            if len(re.findall(rx, text or "", re.M)) < mn:
                ok = False
                break
        if ok:
            return True
    return False


# ---------- arms ----------
def hook_settings(out, name, spec):
    h = spec["hook"]
    tf = os.path.join(out, f"hook-{name}.txt")
    open(tf, "w").write(h["text"])
    ev = h["event"]
    cmd = ("python3 -I -c \"import json;print(json.dumps({'hookSpecificOutput':{'hookEventName':'%s',"
           "'additionalContext':open('%s').read()}}))\"" % (ev, tf))
    sf = os.path.join(out, f"settings-{name}.json")
    json.dump({"hooks": {ev: [{"hooks": [{"type": "command", "command": cmd}]}]}}, open(sf, "w"))
    return sf, cmd


def build_overlay(base_home, files, tag, canary=None):
    d = tempfile.mkdtemp(prefix="pp-", dir=os.environ.get("PROBE_HOME_BASE", "/tmp"))  # short path (design: 25 chars)
    shutil.copytree(os.path.join(base_home, "discipline"), os.path.join(d, "discipline"))
    shutil.copy(os.path.join(base_home, "doctrine.md"), os.path.join(d, "doctrine.md"))
    for rel, src in (files or {}).items():
        dst = os.path.join(d, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy(src, dst)
    if canary:
        p = os.path.join(d, "doctrine.md")
        open(p, "w").write(f"{canary}\n" + open(p).read())
    return d


def claude_cmd(probe, text, maxt, settings=None):
    c = [probe.get("claude_bin", "claude"), "-p", text, "--agent", probe.get("agent", "prdt-po"),
         "--tools", probe.get("tools", "Read,Grep,Glob"), "--no-session-persistence", "--output-format", "json",
         "--max-turns", str(maxt), "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--disable-slash-commands"]
    if settings:
        c += ["--settings", settings]
    return c


def exec_claude(cmd, cwd, env, timeout=420):
    t = time.time()
    try:
        r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL)
        o = {"stdout": r.stdout, "stderr": r.stderr[-500:], "rc": r.returncode}
    except Exception as e:
        o = {"stdout": "", "stderr": str(e), "rc": -1}
    o["wall"] = time.time() - t
    return o


def parse(o):
    try:
        d = json.loads(o["stdout"])
        if d.get("subtype") == "error_max_turns" or d.get("is_error") or not (d.get("result") or "").strip():
            return None, d
        return d, d
    except Exception:
        return None, None


# ---------- PRDT_HOME proof ----------
def prove_home(probe, out, cwd, base_home):
    canary = "PROBE-CANARY-" + os.urandom(4).hex()
    d = build_overlay(base_home, {}, "proof", canary)
    try:
        env = dict(os.environ, PRDT_HOME=d)
        o = exec_claude(claude_cmd(probe, f"Reply with only the token that starts with PROBE-CANARY- found in your injected discipline context, or NONE if there is none.", 8), cwd, env)
        ok_d, d_ = parse(o)
        reply = (d_ or {}).get("result", "") if d_ else ""
        res = {"reached": canary in reply, "canary_observed_in_reply": canary in reply, "overlay_path_len": len(d),
               "cost": (d_ or {}).get("total_cost_usd", 0), "reply_head": reply[:120]}
    finally:
        shutil.rmtree(d, ignore_errors=True)
    json.dump(res, open(os.path.join(out, "prdt-home-proof.json"), "w"), ensure_ascii=False, indent=1)
    return res


# ---------- resource: hook ms ----------
def hook_ms(cmd, payload, n=20, env=None):
    ts = []
    for _ in range(n):
        t = time.perf_counter()
        subprocess.run(cmd, shell=isinstance(cmd, str), input=json.dumps(payload), text=True, capture_output=True, env=env)
        ts.append((time.perf_counter() - t) * 1000)
    return st.median(ts)


def overlay_ms(base_home, overlay_dir, n=20):
    hook = os.path.join(os.path.expanduser("~"), ".prdt", "hooks", "prdt-session-start.sh")
    if not os.path.exists(hook):
        return None
    pay = {"hook_event_name": "SessionStart", "agent_type": "prdt-po", "cwd": os.getcwd()}
    cmd = ["bash", hook]
    a = hook_ms(cmd, pay, n, dict(os.environ, PRDT_HOME=base_home))
    b = hook_ms(cmd, pay, n, dict(os.environ, PRDT_HOME=overlay_dir))
    return b - a


# ---------- run loop ----------
class Budget:
    def __init__(s, cap):
        s.cap, s.spent, s.inflight, s.n, s.lock, s.stopped = cap, 0.0, 0, 0, threading.Lock(), False

    def acquire(s):
        with s.lock:
            avg = s.spent / s.n if s.n else 0.5
            if s.spent + s.inflight * avg >= s.cap:
                s.stopped = True
                return False
            s.inflight += 1
            return True

    def release(s, cost):
        with s.lock:
            s.inflight -= 1
            s.spent += cost
            s.n += 1


def run_all(probe, out, cwd, conc, maxt, base_home, skip_arms):
    arms = {a: probe["arms"][a] for a in ARM_ORDER if a in probe["arms"] and a not in skip_arms}
    prep = {}
    for a, spec in arms.items():
        p = {}
        if "hook" in spec:
            p["settings"], p["hook_cmd"] = hook_settings(out, a, spec)
        if "overlay" in spec:
            p["home"] = build_overlay(base_home, spec["overlay"].get("files"), a)
        prep[a] = p
    os.makedirs(os.path.join(out, "runs"), exist_ok=True)
    bud = Budget(probe["budget_cap_usd"])
    # cost already spent by resumed runs counts against the cap
    for f in glob.glob(os.path.join(out, "runs", "*.json")):
        try:
            bud.spent += json.loads(json.load(open(f))["stdout"]).get("total_cost_usd", 0)
        except Exception:
            pass

    def job(j):
        a, t = j
        f = os.path.join(out, "runs", f"{a}-{t['id']}.json")
        if os.path.exists(f) and parse(json.load(open(f)))[0] is not None:
            return  # valid result kept on resume; invalid (auth/max-turns/error) is re-run
        if not bud.acquire():
            return
        text = t["text"] + (("\n" + arms[a]["prompt_suffix"]) if "prompt_suffix" in arms[a] else "")
        env = dict(os.environ)
        if "home" in prep[a]:
            env["PRDT_HOME"] = prep[a]["home"]
        o = exec_claude(claude_cmd(probe, text, maxt, prep[a].get("settings")), cwd, env)
        _, d = parse(o)
        bud.release((d or {}).get("total_cost_usd", 0) or 0)
        json.dump(o, open(f, "w"), ensure_ascii=False)

    jobs = [(a, t) for t in probe["tasks"] for a in arms]
    with cf.ThreadPoolExecutor(conc) as ex:
        list(ex.map(job, jobs))
    return arms, prep, bud


# ---------- analysis ----------
def load(out, probe, arms):
    R = {}
    for a in arms:
        for t in probe["tasks"]:
            f = os.path.join(out, "runs", f"{a}-{t['id']}.json")
            if not os.path.exists(f):
                continue
            o = json.load(open(f))
            ok, d = parse(o)
            R[(a, t["id"])] = dict(valid=ok is not None, hit=bool(ok and hit(probe["detector"], ok["result"])),
                                   cost=(d or {}).get("total_cost_usd", 0) or 0, wall=o["wall"],
                                   turns=(d or {}).get("num_turns"), sub=(d or {}).get("subtype"))
    return R


def suggest_maxt(turns, floor=30):
    return max(floor, int(round(st.median(turns) * 2.5))) if turns else floor


def verdicts(probe, R, arms):
    tids = [t["id"] for t in probe["tasks"]]
    cnt = {a: sum(1 for t in tids if R.get((a, t), {}).get("hit")) for a in arms}
    thr = probe.get("threshold", {"min_diff": 1, "max_down": 0})
    v, stop = {}, None
    if "positive" in arms and cnt.get("positive", 0) == 0:
        stop = "environment/detector defect"
    for a in arms:
        if a == "control":
            v[a] = "-"
        elif a == "positive":
            v[a] = "positive>0 ok" if cnt[a] > 0 else "environment/detector defect"
        elif stop:
            v[a] = "not judged"
        elif any(not R.get((x, t), {}).get("valid") for x in ("control", a) for t in tids):
            v[a] = "incomplete: invalid or missing runs, re-run before judging"
        else:
            if all(R.get((a, t), {}).get("hit") == R.get(("control", t), {}).get("hit") for t in tids):
                v[a] = "no effect"
            else:
                up = sum(1 for t in tids if R.get((a, t), {}).get("hit") and not R.get(("control", t), {}).get("hit"))
                dn = sum(1 for t in tids if not R.get((a, t), {}).get("hit") and R.get(("control", t), {}).get("hit"))
                v[a] = ("differs: meets threshold, review flips" if (cnt[a] - cnt["control"] >= thr["min_diff"] and dn <= thr["max_down"])
                        else "differs: below threshold or unwanted down-flips")
    if not stop and not any(x.startswith("incomplete") for x in v.values()) and all(v[a] == "no effect" for a in arms if a.startswith("cand")) and any(a.startswith("cand") for a in arms):
        stop = "no effect"
    return cnt, v, stop


def table(probe, out, arms, prep, R, bud, wall_total, conc, base_home, maxt):
    tids = [t["id"] for t in probe["tasks"]]
    cnt, v, stop = verdicts(probe, R, arms)
    ro = set(probe.get("tools", "Read,Grep,Glob").split(",")) <= READ_ONLY
    ctl = [r for (a, _), r in R.items() if a == "control" and r["valid"]]
    mean = lambda rs, k: (sum(r[k] for r in rs) / len(rs)) if rs else 0.0
    rows = ["| arm | hits/n | flips (up/down) | +B x event | fork, ms / firing | $/run | s/run | turns/run | slot-min | verdict |",
            "|---|---|---|---|---|---|---|---|---|---|"]
    for a in arms:
        rs = [r for (x, _), r in R.items() if x == a and r["valid"]]
        up = sum(1 for t in tids if R.get((a, t), {}).get("hit") and not R.get(("control", t), {}).get("hit"))
        dn = sum(1 for t in tids if not R.get((a, t), {}).get("hit") and R.get(("control", t), {}).get("hit"))
        spec = arms[a]
        if "hook" in spec:
            b = len(spec["hook"]["text"].encode()); ev = spec["hook"]["event"]
            pay = {"hook_event_name": ev, "prompt": probe["tasks"][0]["text"], "cwd": os.getcwd()}
            ms = hook_ms(prep[a]["hook_cmd"], pay)
            bx, fk = f"+{b} B x {ev}", f"+1 fork, {ms:.0f} ms"
        elif "overlay" in spec and spec["overlay"].get("files"):
            b = sum(os.path.getsize(s) - (os.path.getsize(os.path.join(base_home, r)) if os.path.exists(os.path.join(base_home, r)) else 0)
                    for r, s in spec["overlay"]["files"].items())
            m = overlay_ms(base_home, prep[a]["home"])
            bx, fk = f"{b:+d} B x session-start", "0 fork, " + (f"{m:+.0f} ms" if m is not None else "n/a ms")
        else:
            bx, fk = ("0", "0 fork, 0 ms") if a == "control" else ("+prompt suffix", "n/a")
        if a == "positive":
            bx, fk = f"+{len(spec.get('prompt_suffix','').encode())} B in user prompt", "0 fork, 0 ms"
        d = lambda k, f: (f"{mean(rs,k):{f}}" + ("" if a == "control" or not ctl else f" ({mean(rs,k)-mean(ctl,k):+{f}})"))
        rows.append(f"| {a} | {cnt[a]}/{len(tids)} | {up}/{dn} | {bx} | {fk} | {d('cost','.3f')} | {d('wall','.0f')} | "
                    f"{d('turns','.1f')} | {'0 (read-only tools)' if ro else 'not measured'} | {v[a]} |")
    invalid = [f"{a}-{t}" for (a, t), r in R.items() if not r["valid"]]
    missing = [f"{a}-{t}" for a in arms for t in tids if (a, t) not in R]
    turns = [r["turns"] for r in R.values() if r["valid"] and r["turns"]]
    lines = [f"purpose: {probe['purpose']}", "", *rows, "",
             f"probe total: ${bud.spent:.2f} (cap ${probe['budget_cap_usd']}), wall {wall_total:.0f} s, concurrency {conc}, max-turns {maxt}",
             f"invalid runs (no reply / max-turns / error, excluded from means): {invalid or 'none'}",
             f"not run (budget cap or skipped arm): {missing or 'none'}",
             f"next max-turns suggestion (median x 2.5, floor 30): {suggest_maxt(turns)}",
             f"stop: {stop or 'none, candidates differ -> main stage'}"]
    return "\n".join(lines), stop


def overlay_key_check(probe):
    """T-1285: an overlay key the session-start hook never reads drops the candidate
    silently, so the arm runs as control (T-1271). Keys: `discipline/<path>` or
    `doctrine.md`, relative, no `..`."""
    bad = []
    for name, a in probe["arms"].items():
        for rel in ((a.get("overlay") or {}).get("files") or {}):
            parts = rel.split("/")
            ok = rel == "doctrine.md" or (len(parts) > 1 and parts[0] == "discipline" and all(p not in ("", ".", "..") for p in parts))
            if not ok:
                bad.append(f"{name}: {rel}")
    if bad:
        sys.exit("overlay key outside discipline/ (the hook never reads it, the arm would run as control): " + ", ".join(bad))


def isolation_check(probe, cwd):
    bad = []
    for n in probe.get("forbid_files", []):
        bad += glob.glob(os.path.join(cwd, "docs", "**", n), recursive=True)
    if bad:
        sys.exit("isolation: remove these from the worktree before running (T-1153 contamination): " + ", ".join(bad))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("probe"); ap.add_argument("--out", required=True)
    ap.add_argument("--cwd", default=os.getcwd()); ap.add_argument("--conc", type=int, default=4)
    ap.add_argument("--maxt", type=int, default=30)
    ap.add_argument("--base-home", default=os.path.expanduser("~/.prdt"))
    ap.add_argument("--dry-run", action="store_true", help="write the manifest and print the plan, run nothing")
    ap.add_argument("--prove-home-only", action="store_true")
    a = ap.parse_args(argv)
    probe = json.load(open(a.probe))
    os.makedirs(a.out, exist_ok=True)
    overlay_key_check(probe)
    isolation_check(probe, a.cwd)
    mp = write_manifest(a.out, a.probe, probe)
    print(f"manifest: {mp}")
    skip = set()
    overlay_arms = [n for n, s in probe["arms"].items() if "overlay" in s]
    if overlay_arms and not a.dry_run:
        pr = prove_home(probe, a.out, a.cwd, a.base_home)
        print(f"PRDT_HOME proof: reached={pr['reached']} cost=${pr['cost']:.3f}")
        if not pr["reached"]:
            print("GAP: PRDT_HOME does not reach the session-start hook subprocess; overlay arms skipped")
            skip = set(overlay_arms)
    if a.prove_home_only:
        return 0
    n = len(probe["tasks"]) * len([x for x in probe["arms"] if x not in skip])
    print(f"plan: {len(probe['tasks'])} tasks x arms {[x for x in ARM_ORDER if x in probe['arms'] and x not in skip]} = {n} runs, cap ${probe['budget_cap_usd']}")
    if a.dry_run:
        return 0
    t0 = time.time()
    arms, prep, bud = run_all(probe, a.out, a.cwd, a.conc, a.maxt, a.base_home, skip)
    try:
        R = load(a.out, probe, arms)
        txt, stop = table(probe, a.out, arms, prep, R, bud, time.time() - t0, a.conc, a.base_home, a.maxt)
    finally:
        for p in prep.values():
            if "home" in p:
                shutil.rmtree(p["home"], ignore_errors=True)
    open(os.path.join(a.out, "verdict.md"), "w").write(txt + "\n")
    print(txt)
    return 0


if __name__ == "__main__":
    sys.exit(main())
