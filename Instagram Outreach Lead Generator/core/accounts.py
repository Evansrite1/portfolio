"""Up to 10 Instagram accounts. Each has its own saved login in its own folder, so the accounts never share a session, and its
own browser window. The first account keeps the folder older versions used, so an existing login still works."""
import json
import re
import threading
from pathlib import Path

from .engine import Engine

MAX_ACCOUNTS = 10
DEFAULT_DAILY = 20
HARD_DAILY = 30


class Accounts:
    def __init__(self, home, log):
        self.home, self.log = Path(home), log
        self.file = self.home / "ig-accounts.json"
        self.lock = threading.RLock()
        self.engines = {}
        self.items = self._load()

    def _load(self):
        try:
            d = json.loads(self.file.read_text(encoding="utf-8"))
            if isinstance(d, list) and d:
                return d
        except Exception:
            pass
        return [{"id": "a1", "label": "Account 1", "enabled": True, "daily": DEFAULT_DAILY}]

    def _save(self):
        self.home.mkdir(parents=True, exist_ok=True)
        self.file.write_text(json.dumps(self.items), encoding="utf-8")

    def profile_dir(self, aid):
        return self.home / "profile" if aid == "a1" else self.home / "profiles" / aid

    def get(self, aid):
        return next((a for a in self.items if a["id"] == aid), None)

    def engine(self, aid):
        with self.lock:
            if aid not in self.engines:
                if not self.get(aid):
                    raise KeyError(aid)
                self.engines[aid] = Engine(self.profile_dir(aid), lambda m, a=aid: self.log(f"[{self.get(a)['label']}] {m}"))
            return self.engines[aid]

    def first_logged_in(self):
        for a in self.items:
            if a["id"] in self.engines and self.engines[a["id"]].status().get("logged_in"):
                return self.engines[a["id"]]
        return None

    def add(self, label):
        with self.lock:
            if len(self.items) >= MAX_ACCOUNTS:
                raise ValueError(f"You can add up to {MAX_ACCOUNTS} Instagram accounts.")
            n = 1 + max(int(a["id"][1:]) for a in self.items)
            label = (label or "").strip()[:40] or f"Account {n}"
            if any(a["label"].lower() == label.lower() for a in self.items):
                raise ValueError("Another account already has that name.")
            self.items.append({"id": f"a{n}", "label": label, "enabled": True, "daily": DEFAULT_DAILY})
            self._save()
            return self.items[-1]

    def update(self, aid, **kw):
        with self.lock:
            a = self.get(aid)
            if not a:
                raise KeyError(aid)
            if "label" in kw and re.sub(r"\s", "", str(kw["label"])):
                a["label"] = str(kw["label"]).strip()[:40]
            if "enabled" in kw:
                a["enabled"] = bool(kw["enabled"])
            if "daily" in kw:
                a["daily"] = max(1, min(HARD_DAILY, int(kw["daily"])))
            self._save()
            return a

    def remove(self, aid):
        with self.lock:
            if len(self.items) <= 1:
                raise ValueError("Keep at least one account.")
            e = self.engines.pop(aid, None)
            if e:
                e.close()
            self.items = [a for a in self.items if a["id"] != aid]
            self._save()

    def status(self):
        out = []
        for a in self.items:
            e = self.engines.get(a["id"])
            st = e.status() if e else {"browser_open": False, "logged_in": False}
            out.append({**a, **st})
        return out

    def close_all(self):
        for e in list(self.engines.values()):
            try:
                e.close()
            except Exception:
                pass
