#!/usr/bin/env python
"""Streaming-subtitle latency with asynchronous idle-time prefill against a running llama-server (CPU, batch 1). Pure client; llama.cpp is not modified.
A stream of consecutive subtitle lines arrives every --interval seconds. For every line the prompt is  HEAD + CTX(last 3 lines) + CUR marker + <line> + SUFFIX  (current CTX/CUR format).
Conditions:
  cold     cache_prompt=false (every request prefills the whole prompt)                          [reference]
  cache    cache_prompt=true, no warm-up (server reuses the longest common prefix only)
  prewarm  cache_prompt=true + after every answer a warm-up request with everything that is already known for the NEXT prompt
           (HEAD + CTX incl. the line just translated + CUR marker), n_predict=0; the foreground request then only prefills <line> + SUFFIX
Latency is measured from the scheduled ARRIVAL of a line to the end of the response (a request that arrives while a warm-up is still running waits for it).
usage: PYTHONPATH=src envs/laya/bin/python scripts/bench/streaming_prewarm.py --server http://127.0.0.1:8190 --tokenizer DIR --out F.json [--n 100 --interval 3.0 --conditions cold,cache,prewarm]"""
import argparse, json, threading, time, urllib.request
import numpy as np
from tokenizers import Tokenizer
from localsubs.training.format import prompt_text, IM_END, IM_START

SUFFIX = f"{IM_END}\n{IM_START}assistant\n"


def post(url, payload, timeout=120):
    req = urllib.request.Request(url + "/completion", data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read())


def build_stream(train, n):
    """n lines: documents with the most training rows, each in subtitle order, concatenated (timing only; the rows are not evaluated; context across a document boundary is arbitrary but the token counts are realistic)."""
    docs = {}
    for l in open(train, encoding="utf-8"):
        r = json.loads(l); doc, _, sl = r["example_id"].partition("#SL")
        if sl.isdigit(): docs.setdefault(doc, []).append((int(sl), r["cur_en"]))
    out = []
    for d in sorted(docs.values(), key=len, reverse=True):
        out += [t for _, t in sorted(d)]
        if len(out) >= n: break
    return out[:n]


def prefix_for(ctx):
    p = prompt_text(ctx[-3:], "")       # ... CUR marker + "" + SUFFIX
    assert p.endswith(SUFFIX); return p[:-len(SUFFIX)]


def run(cond, a, lines, gaps, tok):
    """gaps[k] = seconds between the arrival of line k and line k+1 (real subtitle gaps, capped); cold/cache use --fast-interval instead (they do not use idle time)."""
    cache = cond != "cold"; warm = cond == "prewarm"
    arr_t = [0.0]
    for k in range(len(lines) - 1): arr_t.append(arr_t[-1] + (gaps[k] if (warm or a.real_gaps_all) else a.fast_interval))
    lat, prompt_n, cache_n, pred_n, pred_ms, prompt_ms, outs, wait_ms = [], [], [], [], [], [], [], []
    warm_info = []; wend = {}; warm_thread = [None]
    t0 = time.perf_counter() + 0.5
    for k, cur in enumerate(lines):
        arrival = t0 + arr_t[k]
        d = arrival - time.perf_counter()
        if d > 0: time.sleep(d)
        prompt = prompt_text(lines[max(0, k - 3):k], cur)
        r = post(a.server, {"prompt": prompt, "n_predict": a.max_new, "temperature": 0, "cache_prompt": cache, "stream": False})
        end = time.perf_counter(); tm = r["timings"]
        wait_ms.append(max(0.0, (wend.get(k, 0.0) - arrival) * 1000) if warm else 0.0)       # time this request waited for the still-running warm-up of its own prefix
        lat.append((end - arrival) * 1000); prompt_n.append(tm["prompt_n"]); cache_n.append(tm.get("cache_n", r.get("tokens_cached", 0))); pred_n.append(tm["predicted_n"])
        pred_ms.append(tm["predicted_ms"]); prompt_ms.append(tm["prompt_ms"]); outs.append(r["content"].strip())
        if k == 0: assert abs(r["tokens_evaluated"] - len(tok.encode(prompt, add_special_tokens=False).ids)) <= 1, "server tokenisation differs"
        if warm and k + 1 < len(lines):
            pre = prefix_for(lines[max(0, k - 2):k + 1])
            def w(pre=pre, nxt=k + 1):
                s_ = time.perf_counter(); rr = post(a.server, {"prompt": pre, "n_predict": a.warm_n_predict, "temperature": 0, "cache_prompt": True, "stream": False})
                wend[nxt] = time.perf_counter(); warm_info.append(((wend[nxt] - s_) * 1000, rr["timings"]["prompt_n"]))
            warm_thread[0] = threading.Thread(target=w); warm_thread[0].start()
    if warm_thread[0]: warm_thread[0].join()
    sl = slice(a.skip, None); arr = lambda x: np.array(x[sl]); L = arr(lat)
    q = lambda x: {"mean": float(np.mean(x)), "std": float(np.std(x)), "p50": float(np.percentile(x, 50)), "p90": float(np.percentile(x, 90)), "p95": float(np.percentile(x, 95)), "p99": float(np.percentile(x, 99)), "max": float(np.max(x))}
    res = {"condition": cond, "n": int(len(L)), "latency_ms": q(L), "p95_over_p50": float(np.percentile(L, 95) / np.percentile(L, 50)), "p99_over_p50": float(np.percentile(L, 99) / np.percentile(L, 50)),
           "successive_jitter_ms": float(np.mean(np.abs(np.diff(L)))), "share_over_500ms": float((L > 500).mean()), "share_over_1000ms": float((L > 1000).mean()),
           "prompt_tokens_evaluated_mean": float(arr(prompt_n).mean()), "cache_tokens_reused_mean": float(arr(cache_n).mean()), "decode_steps_mean": float(arr(pred_n).mean()),
           "prefill_ms_mean": float(arr(prompt_ms).mean()), "decode_ms_mean": float(arr(pred_ms).mean()), "warm_requests": len(warm_info),
           "warm_ms_mean": float(np.mean([w[0] for w in warm_info])) if warm_info else None, "warm_prompt_tokens_mean": float(np.mean([w[1] for w in warm_info])) if warm_info else None,
           "outputs": outs, "latency_all_ms": lat, "wait_for_warm_ms_all": wait_ms}
    if warm:
        W = arr(wait_ms); res["requests_that_waited_for_warmup"] = float((W > 1).mean()); res["wait_for_warm_ms_mean_of_waiters"] = float(W[W > 1].mean()) if (W > 1).any() else 0.0
        g = np.array([gaps[k - 1] for k in range(len(lines))][a.skip:]) if len(gaps) else np.zeros(len(L))
        res["by_gap"] = {}
        for lo, hi in ((0, 1), (1, 2), (2, 3), (3, 99)):
            m = (g >= lo) & (g < hi)
            if m.sum(): res["by_gap"][f"{lo}-{hi}s"] = {"share": float(m.mean()), "latency_mean_ms": float(L[m].mean()), "latency_p95_ms": float(np.percentile(L[m], 95)), "waited": float((W[m] > 1).mean())}
    return res


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--server", default="http://127.0.0.1:8190"); ap.add_argument("--tokenizer", required=True, help="model dir with tokenizer.json (sanity check of server tokenisation)")
    ap.add_argument("--out", required=True); ap.add_argument("--train", default="../data/sft_rework/ruleA/train.jsonl"); ap.add_argument("--n", type=int, default=100); ap.add_argument("--interval", type=float, default=3.0)
    ap.add_argument("--stream-file", default="", help="real streams from scripts/bench/extract_opus_stream.py (real subtitle gaps); otherwise synthetic lines every --interval seconds")
    ap.add_argument("--gap-cap-s", type=float, default=4.0, help="real gaps are capped at this value (longer gaps behave identically once the warm-up has finished)")
    ap.add_argument("--fast-interval", type=float, default=1.0, help="arrival spacing for the cold/cache conditions (they do not use idle time)"); ap.add_argument("--max-new", type=int, default=96)
    ap.add_argument("--real-gaps-all", action="store_true", help="use the real (capped) gaps for ALL conditions: then cold/cache queue up behind each other exactly like in production")
    ap.add_argument("--warm-n-predict", type=int, default=0); ap.add_argument("--skip", type=int, default=3, help="first requests excluded from statistics (short contexts)"); ap.add_argument("--conditions", default="cold,cache,prewarm")
    a = ap.parse_args()
    tok = Tokenizer.from_file(a.tokenizer + "/tokenizer.json")
    if a.stream_file:
        lines, gaps = [], []
        for d in json.load(open(a.stream_file)):
            st = d["start_ms"]; g = [min(max((b - x) / 1000, 0.05), a.gap_cap_s) for x, b in zip(st, st[1:])] + [a.gap_cap_s]
            lines += d["lines"]; gaps += g
    else:
        lines = build_stream(a.train, a.n); gaps = [a.interval] * len(lines)
    print("stream", len(lines), "lines; first:", lines[:2], "| gap s: p5 %.2f p50 %.2f mean %.2f | <1 s %.1f%%" % (*np.percentile(gaps, [5, 50]), np.mean(gaps), 100 * np.mean(np.array(gaps) < 1)), flush=True)
    post(a.server, {"prompt": "warm up", "n_predict": 2, "cache_prompt": False})
    res = {}
    for cond in a.conditions.split(","):
        post(a.server, {"prompt": "reset the slot cache", "n_predict": 1, "cache_prompt": True})
        res[cond] = run(cond, a, lines, gaps, tok); r = res[cond]; L = r["latency_ms"]
        print(f"{cond:8s} n={r['n']} latency mean {L['mean']:.0f} std {L['std']:.0f} p50 {L['p50']:.0f} p90 {L['p90']:.0f} p95 {L['p95']:.0f} p99 {L['p99']:.0f} max {L['max']:.0f} ms | p95/p50 {r['p95_over_p50']:.2f} p99/p50 {r['p99_over_p50']:.2f} | successive jitter {r['successive_jitter_ms']:.0f} ms | >500ms {100 * r['share_over_500ms']:.1f}% >1s {100 * r['share_over_1000ms']:.1f}% | "
              f"prefill tokens {r['prompt_tokens_evaluated_mean']:.1f} (reused {r['cache_tokens_reused_mean']:.1f}) prefill {r['prefill_ms_mean']:.0f} ms decode {r['decode_ms_mean']:.0f} ms ({r['decode_steps_mean']:.1f} steps)"
              + (f" | warm {r['warm_ms_mean']:.0f} ms ({r['warm_prompt_tokens_mean']:.0f} tok), requests that waited for warm-up {100 * r['requests_that_waited_for_warmup']:.1f}%" if r.get("warm_ms_mean") else ""), flush=True)
        if r.get("by_gap"): print("   by gap since previous line:", {k: f"{100 * v['share']:.0f}% mean {v['latency_mean_ms']:.0f} p95 {v['latency_p95_ms']:.0f} waited {100 * v['waited']:.0f}%" for k, v in r["by_gap"].items()}, flush=True)
    base = res[next(iter(res))]["outputs"]
    for c, r in res.items(): print(f"outputs identical to {next(iter(res))}: {c}: {sum(x == y for x, y in zip(base, r['outputs']))}/{len(base)}")
    json.dump(res, open(a.out, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
