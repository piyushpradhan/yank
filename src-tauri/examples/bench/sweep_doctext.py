"""Which document text to embed? (EmbeddingGemma Q4)"""
import numpy as np
import bench as b

m = b.register_gemma("model_q4")
b.DPREFIX[m] = ""  # variants below carry their own gemma prompt
qtexts = [b.intent(q["q"])[0] or q["q"] for q in b.QUERIES]
idx = {q["q"]: i for i, q in enumerate(b.QUERIES)}
Q = b._norm(b.query_vecs(m, qtexts))

def body(it, n=500): return it["content"].strip()[:n]
V = {
    "title:none | text: label+body500 (bench default)": lambda it: "title: none | text: " + b.cand_text(it, with_source=False),
    "title:none | text: body500": lambda it: "title: none | text: " + body(it),
    "title:label | text: body500": lambda it: f"title: {it['label'] or 'none'} | text: " + body(it),
    "title:none | text: label+body+(from src)": lambda it: "title: none | text: " + b.cand_text(it, with_source=True),
    "title:none | text: [cat] label+body": lambda it: f"title: none | text: [{it['category']}] " + b.cand_text(it, with_source=False),
    "title:none | text: label+body2000": lambda it: "title: none | text: " + b.cand_text(it, with_source=False, max_chars=2000),
    "no prompt: label+body500": lambda it: b.cand_text(it, with_source=False),
    "[cat] label+body (from src)  <- shipped": lambda it: f"title: none | text: [{it['category']}] " + b.cand_text(it, with_source=True),
    "label+body (from src) [cat]": lambda it: "title: none | text: " + b.cand_text(it, with_source=True) + f" [{it['category']}]",
    "title:src | text: [cat] label+body": lambda it: f"title: {it['source'] or 'none'} | text: [{it['category']}] " + b.cand_text(it, with_source=False),
}
for name, fn in V.items():
    D = b._norm(b.doc_matrix(m, fn)); S = Q @ D.T
    b.show(name, b.evaluate(lambda q: list(np.argsort(-S[idx[q["q"]]])[:50]))[0])
