import sqlite3
import time
import json
import threading

from . import config

_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT DEFAULT '',
  smtp_host TEXT, smtp_port INTEGER DEFAULT 587,
  imap_host TEXT, imap_port INTEGER DEFAULT 993,
  username TEXT,
  daily_cap INTEGER DEFAULT 40,
  warmup_start REAL,
  enabled INTEGER DEFAULT 1,
  last_send_ts REAL DEFAULT 0,
  last_imap_uid INTEGER DEFAULT 0,
  created REAL
);
CREATE TABLE IF NOT EXISTS leads(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  first TEXT DEFAULT '', biz TEXT DEFAULT '', city TEXT DEFAULT '',
  website TEXT DEFAULT '', site_status TEXT DEFAULT 'UNKNOWN',
  source TEXT DEFAULT '', status TEXT DEFAULT 'new',
  created REAL
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER, lead_id INTEGER,
  direction TEXT, kind TEXT,
  message_id TEXT, in_reply_to TEXT, refs TEXT,
  subject TEXT, body TEXT, to_addr TEXT, from_addr TEXT,
  ts REAL, uid INTEGER, token TEXT
);
CREATE INDEX IF NOT EXISTS ix_msg_mid ON messages(message_id);
CREATE INDEX IF NOT EXISTS ix_msg_acc ON messages(account_id, direction, ts);
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT, lead_id INTEGER, type TEXT, ts REAL, detail TEXT
);
CREATE TABLE IF NOT EXISTS suppression(email TEXT PRIMARY KEY, reason TEXT, ts REAL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
"""


def _migrate(c):
    cols = {r[1] for r in c.execute("PRAGMA table_info(accounts)")}
    for name, ddl in (("daily_min", "INTEGER DEFAULT 20"), ("skip_warmup", "INTEGER DEFAULT 0"),
                      ("paused_until", "REAL DEFAULT 0"), ("auto_push", "INTEGER DEFAULT 0"), ("last_push_ts", "REAL DEFAULT 0"), ("paused_reason", "TEXT DEFAULT ''")):
        if name not in cols:
            c.execute(f"ALTER TABLE accounts ADD COLUMN {name} {ddl}")
    lcols = {r[1] for r in c.execute("PRAGMA table_info(leads)")}
    if "data" not in lcols:
        c.execute("ALTER TABLE leads ADD COLUMN data TEXT DEFAULT ''")
    c.commit()


def conn():
    c = getattr(_local, "c", None)
    path = config.DB_PATH
    if c is None or getattr(_local, "path", None) != path:
        c = sqlite3.connect(path, timeout=30)
        c.row_factory = sqlite3.Row
        c.executescript(SCHEMA)
        _migrate(c)
        _local.c = c
        _local.path = path
    return c


def q(sql, args=()):
    return [dict(r) for r in conn().execute(sql, args).fetchall()]


def one(sql, args=()):
    r = conn().execute(sql, args).fetchone()
    return dict(r) if r else None


def run(sql, args=()):
    c = conn()
    cur = c.execute(sql, args)
    c.commit()
    return cur.lastrowid


def get_setting(key, default=None):
    r = one("SELECT value FROM settings WHERE key=?", (key,))
    if r is None:
        return default
    try:
        return json.loads(r["value"])
    except Exception:
        return r["value"]


def set_setting(key, value):
    run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, json.dumps(value)))


def now():
    return time.time()
