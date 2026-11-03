"""Inventory from the pinned mutator parser, before mutation; no cached snapshots."""
import hashlib
import json
import sys
from pathlib import Path

from mutator.functions import form_digests, form_spans

root = Path(__file__).resolve().parents[2]
files = []
for name in sorted(set(Path(sys.argv[1]).read_text(encoding="utf-8").splitlines())):
    path = root / name
    raw = path.read_bytes()
    source = raw.decode("utf-8")
    digests = form_digests(source, path, root)
    forms = []
    for (namespace, form_id), (start, end, _name, _private) in form_spans(source, path, root).items():
        forms.append({"namespace": namespace, "id": form_id, "line": start, "end-line": end,
                      "hash": digests[(namespace, form_id)]})
    files.append({"source": name, "sha256": hashlib.sha256(raw).hexdigest(), "forms": forms})
print(json.dumps({"version": 1, "files": files}, ensure_ascii=False, sort_keys=True))
