import json, os, stat, subprocess, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import probe as P

FAKE = '''#!/usr/bin/env python3
import sys, json, os, re
a = sys.argv
text = a[a.index("-p") + 1]
res = "plain"
if os.environ.get("FAKE_AUTH_FAIL") and "--settings" in a:
    print(json.dumps({"result": "Not logged in", "is_error": True, "subtype": "success"})); sys.exit(1)
if "--settings" in a and os.environ.get("FAKE_HOOK_WORKS", "1") == "1": res = "HIT"
if "SUFFIX" in text and os.environ.get("FAKE_POS_WORKS", "1") == "1": res = "HIT"
h = os.environ.get("PRDT_HOME")
if h and os.environ.get("FAKE_HOME_REACHES", "1") == "1":
    m = re.search(r"PROBE-CANARY-\\w+", open(h + "/doctrine.md").read())
    if m and "PROBE-CANARY" in text: res = m.group(0)
print(json.dumps({"result": res, "total_cost_usd": 0.1, "num_turns": 4, "duration_ms": 10, "subtype": "success", "is_error": False}))
'''


def mk(tmp, **kw):
    fake = os.path.join(tmp, "fakeclaude"); open(fake, "w").write(FAKE); os.chmod(fake, 0o755)
    pr = {"purpose": "p", "claude_bin": fake, "budget_cap_usd": kw.get("cap", 5),
          "detector": {"rules": [{"all": ["HIT"]}]},
          "tasks": [{"id": f"t{i}", "text": f"task {i}"} for i in range(3)],
          "threshold": {"min_diff": 1, "max_down": 0},
          "arms": {"control": {}, "cand-a": {"hook": {"event": "UserPromptSubmit", "text": "abc"}},
                   "positive": {"prompt_suffix": "SUFFIX"}}}
    pr.update(kw.get("extra", {}))
    pp = os.path.join(tmp, "probe.json"); json.dump(pr, open(pp, "w"))
    return pp


def run(pp, out, env=None):
    e = dict(os.environ, **(env or {}))
    return subprocess.run([sys.executable, os.path.join(HERE, "probe.py"), pp, "--out", out, "--cwd", os.path.dirname(pp), "--conc", "2"],
                          capture_output=True, text=True, env=e)


class T(unittest.TestCase):
    def test_detector_min_and_any(self):
        d = {"rules": [{"all": [{"re": r"^###", "min": 2}]}, {"all": ["zz"]}]}
        self.assertTrue(P.hit(d, "### a\n### b")); self.assertTrue(P.hit(d, "zz"))
        self.assertFalse(P.hit(d, "### a"))

    def test_maxt_floor_and_scale(self):
        self.assertEqual(P.suggest_maxt([5, 6, 7]), 30); self.assertEqual(P.suggest_maxt([20, 22, 24]), 55)

    def test_manifest_before_runs_and_mismatch(self):
        with tempfile.TemporaryDirectory() as t:
            pp = mk(t); out = os.path.join(t, "o")
            r = subprocess.run([sys.executable, os.path.join(HERE, "probe.py"), pp, "--out", out, "--dry-run"], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            m = open(os.path.join(out, P.MANIFEST)).read()
            self.assertIn("probe.json", m); self.assertIn("tasks.json", m); self.assertIn("detector.json", m)
            self.assertFalse(os.path.exists(os.path.join(out, "runs")))
            pr = json.load(open(pp)); pr["purpose"] = "changed"; json.dump(pr, open(pp, "w"))
            r = subprocess.run([sys.executable, os.path.join(HERE, "probe.py"), pp, "--out", out, "--dry-run"], capture_output=True, text=True)
            self.assertNotEqual(r.returncode, 0)

    def test_table_columns_and_differs(self):
        with tempfile.TemporaryDirectory() as t:
            r = run(mk(t), os.path.join(t, "o"))
            self.assertEqual(r.returncode, 0, r.stderr)
            for col in ("hits/n", "flips", "+B x event", "ms / firing", "$/run", "s/run", "turns/run", "slot-min", "probe total"):
                self.assertIn(col, r.stdout)
            self.assertIn("+3 B x UserPromptSubmit", r.stdout); self.assertIn("differs: meets threshold", r.stdout)

    def test_no_effect_stop(self):
        with tempfile.TemporaryDirectory() as t:
            r = run(mk(t), os.path.join(t, "o"), {"FAKE_HOOK_WORKS": "0"})
            self.assertIn("stop: no effect", r.stdout)

    def test_positive_failure_stops_as_env_defect(self):
        with tempfile.TemporaryDirectory() as t:
            r = run(mk(t), os.path.join(t, "o"), {"FAKE_POS_WORKS": "0"})
            self.assertIn("stop: environment/detector defect", r.stdout); self.assertIn("not judged", r.stdout)

    def test_invalid_run_blocks_no_effect_and_rerun_on_resume(self):
        with tempfile.TemporaryDirectory() as t:
            pp = mk(t); out = os.path.join(t, "o")
            r = run(pp, out, {"FAKE_HOOK_WORKS": "0", "FAKE_AUTH_FAIL": "1"})
            self.assertIn("incomplete", r.stdout); self.assertNotIn("stop: no effect", r.stdout)
            r = run(pp, out, {"FAKE_HOOK_WORKS": "0"})
            self.assertIn("stop: no effect", r.stdout)

    def test_budget_cap_stops(self):
        with tempfile.TemporaryDirectory() as t:
            r = run(mk(t, cap=0.25), os.path.join(t, "o"))
            self.assertIn("not run", r.stdout); self.assertNotIn("not run (budget cap or skipped arm): none", r.stdout)

    def test_overlay_home_proof_gap_skips_overlay_arms(self):
        with tempfile.TemporaryDirectory() as t:
            base = os.path.join(t, "home"); os.makedirs(base + "/discipline"); open(base + "/doctrine.md", "w").write("d")
            ov = {"arms": {"control": {"overlay": {}}, "cand-a": {"overlay": {}}}}
            pp = mk(t, extra=ov); out = os.path.join(t, "o")
            for reaches, want in (("1", "reached=True"), ("0", "GAP")):
                r = subprocess.run([sys.executable, os.path.join(HERE, "probe.py"), pp, "--out", out + reaches, "--cwd", t, "--base-home", base,
                                    "--prove-home-only"], capture_output=True, text=True, env=dict(os.environ, FAKE_HOME_REACHES=reaches))
                self.assertIn(want, r.stdout, r.stdout + r.stderr)

    def test_isolation_forbid(self):
        with tempfile.TemporaryDirectory() as t:
            os.makedirs(t + "/docs/x"); open(t + "/docs/x/T-9.md", "w").write("x")
            r = run(mk(t, extra={"forbid_files": ["T-9.md"]}), os.path.join(t, "o"))
            self.assertNotEqual(r.returncode, 0); self.assertIn("isolation", r.stderr)

    def test_overlay_key_outside_discipline_fails_loudly(self):
        # T-1285: a key the session-start hook never reads (no `discipline/` prefix, `..`, absolute)
        # used to drop the candidate silently, so the arm ran as control (T-1271).
        with tempfile.TemporaryDirectory() as t:
            src = os.path.join(t, "src.md"); open(src, "w").write("x")
            for bad in ("po/habit.md", "discipline/../po/habit.md", "/abs/discipline/x.md", "disciplinex/po.md"):
                pp = mk(t, extra={"arms": {"control": {"overlay": {}}, "cand-a": {"overlay": {"files": {bad: src}}}}})
                r = subprocess.run([sys.executable, os.path.join(HERE, "probe.py"), pp, "--out", os.path.join(t, "o-" + str(abs(hash(bad)))),
                                    "--dry-run"], capture_output=True, text=True)
                self.assertNotEqual(r.returncode, 0, bad)
                self.assertIn("overlay key", r.stderr, bad); self.assertIn(bad, r.stderr)
            for good in ("discipline/po/habit.md", "doctrine.md"):
                pp = mk(t, extra={"arms": {"control": {"overlay": {}}, "cand-a": {"overlay": {"files": {good: src}}}}})
                r = subprocess.run([sys.executable, os.path.join(HERE, "probe.py"), pp, "--out", os.path.join(t, "ok-" + str(abs(hash(good)))),
                                    "--dry-run"], capture_output=True, text=True)
                self.assertEqual(r.returncode, 0, good + r.stderr)


if __name__ == "__main__":
    unittest.main()
