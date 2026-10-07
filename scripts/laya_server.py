#!/usr/bin/env python3
"""Local Laya re-ranker for Yank — a TypeSafe-compatible `/v1/systemone` server.

Yank's semantic search sends the same request to TypeSafe's Jev (cloud) or to
this server (local, Apple Silicon via MLX), so switching provider changes only
the URL. Laya (convaiinnovations/laya, ModernBERT-large + decision head) is a
System One model like Jev: typed questions in, calibrated probabilities out.

    uv run --with laya-mlx scripts/laya_server.py            # :8765
    uv run --with laya-mlx scripts/laya_server.py --port 9000

Then pick "Laya (local)" in Yank's AI settings (URL defaults to
http://127.0.0.1:8765/v1/systemone).

One adaptation: Laya reads at most 512 tokens per pass, so Yank's re-rank
question (a Choice over up to 50 `clipboard_items`) cannot fit in one pass the
way it does for Jev. For that request shape the server scores every option in
its own pass — "is this item what `search_query` is after?" — batched into a
few forward passes, and returns the softmax over those scores as the Choice
probabilities. Any other request goes to Laya unchanged.
"""

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from laya_mlx import Agent
from laya_mlx.agent import collate_items

MODEL = "aac6fef/laya-mlx"
ITEM_QUESTION = {
    "type": "noul",
    "instructions": "Is `clipboard_item` the item the user is looking for with `search_query`?",
    "criteria": {
        "true": "The clipboard item is the exact item the query asks for: the same entity, value, link, file, or the specific information requested.",
        "false": "The clipboard item is only on a similar topic, a different item of the same kind, or does not supply what the query asks for.",
    },
}

agent = None
lock = threading.Lock()  # one MLX forward at a time


def rerank_choice(state, qid, q):
    """Choice over `state.clipboard_items` scored item-by-item (see module doc)."""
    items = state["clipboard_items"]
    keys = [k for k in q["criteria"] if k in items]
    prepared = []
    for k in keys:
        its, _ = agent.prepare({"search_query": state["search_query"], "clipboard_item": items[k]}, {"x": ITEM_QUESTION})
        prepared += its
    order = sorted(range(len(prepared)), key=lambda i: len(prepared[i]["ids"]))  # less padding
    logits = np.zeros(len(prepared), dtype=np.float32)
    for s in range(0, len(order), 32):
        chunk = [prepared[i] for i in order[s:s + 32]]
        out, _ = agent.forward(collate_items(chunk, agent.tok.pad_token_id, max_length=agent.cfg.get("max_len", 512)))
        out = np.asarray(out, dtype=np.float32)
        for r, i in enumerate(order[s:s + 32]):
            logits[i] = out[r, 1] - out[r, 0]  # noul options are [false, true]
    p = np.exp(logits - logits.max())
    p /= p.sum()
    probs = {k: float(v) for k, v in zip(keys, p)}  # unrounded: callers take log-probs
    best = keys[int(p.argmax())] if keys else None
    return {"type": "choice", "choice": best, "probabilities": probs, "confidence": round(float(p.max()), 4) if keys else 0.0}


def is_rerank(state, q):
    return (q.get("type") == "choice" and isinstance(state, dict)
            and isinstance(state.get("clipboard_items"), dict) and "search_query" in state)


def systemone(body):
    state, questions = body["state"], body["questions"]
    answers, rest = {}, {}
    with lock:
        for qid, q in questions.items():
            if is_rerank(state, q):
                answers[qid] = rerank_choice(state, qid, q)
            else:
                rest[qid] = q
        if rest:
            answers.update(agent.system_one(state, rest)["answers"])
    return {"model": "laya", "answers": answers, "usage": {"input_tokens": 0, "output_tokens": 0}}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.rstrip("/") == "/v1/models":
            return self._send(200, {"models": [{"name": "laya", "description": MODEL, "release_date": ""}]})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/v1/systemone":
            return self._send(404, {"error": "not found"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            self._send(200, systemone(body))
        except (KeyError, ValueError, TypeError) as e:
            self._send(422, {"error": str(e)})

    def log_message(self, *args):
        pass


def main():
    global agent
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--model", default=MODEL)
    a = ap.parse_args()
    agent = Agent(a.model, dtype="float16", batch_size=32, cache_prompts=True)
    systemone({"state": {"search_query": "warmup", "clipboard_items": {"a": "hello"}},
               "questions": {"p": {"type": "choice", "instructions": "", "criteria": {"a": None}}}})
    print(f"Laya ready on http://{a.host}:{a.port}/v1/systemone", flush=True)
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
