"""A mailbox inside the app: folders, message list, reading, replying, deleting, spam. Talks to the mail server over IMAP
whenever you look, and stores no mail on this computer. Standard library only."""
import email
import email.utils
import html as _html
import imaplib
import re
import threading
import time
from email.header import decode_header, make_header

from . import config, secrets_store

ROLES = {"\\inbox": "inbox", "\\sent": "sent", "\\drafts": "drafts", "\\junk": "spam", "\\trash": "trash", "\\all": "all", "\\flagged": "starred", "\\important": "important"}
ORDER = ["inbox", "starred", "sent", "drafts", "spam", "trash", "all"]
TITLES = {"inbox": "Inbox", "starred": "Starred", "sent": "Sent", "drafts": "Drafts", "spam": "Spam", "trash": "Trash", "all": "All mail"}

_conns = {}
_locks = {}
_mu = threading.Lock()
IDLE = 90


def _lock(key):
    with _mu:
        return _locks.setdefault(key, threading.RLock())


def _dec(v):
    try:
        return str(make_header(decode_header(v or "")))
    except Exception:
        return str(v or "")


def _conn(acct):
    key = acct["email"]
    c, t = _conns.get(key, (None, 0))
    if c is not None and time.time() - t < IDLE:
        try:
            c.noop()
            _conns[key] = (c, time.time())
            return c
        except Exception:
            c = None
    pw = secrets_store.get_secret(acct["email"])
    if pw is None:
        raise RuntimeError("No saved sign-in for " + acct["email"])
    port = int(acct.get("imap_port") or 993)
    c = imaplib.IMAP4(acct["imap_host"], port, timeout=40) if config.plain(acct["imap_host"]) else imaplib.IMAP4_SSL(acct["imap_host"], port, timeout=40)
    c.login(acct.get("username") or acct["email"], pw)
    _conns[key] = (c, time.time())
    return c


def close(email_addr):
    with _lock(email_addr):
        c, _ = _conns.pop(email_addr, (None, 0))
        try:
            if c:
                c.logout()
        except Exception:
            pass


def _quote(name):
    return '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _parse_list(line):
    s = line.decode("utf-8", "replace") if isinstance(line, bytes) else str(line)
    m = re.match(r'\((?P<flags>[^)]*)\)\s+(?P<sep>"[^"]*"|NIL)\s+(?P<name>.+)$', s)
    if not m:
        return None
    name = m.group("name").strip()
    if name.startswith('"') and name.endswith('"'):
        name = name[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    return m.group("flags").lower().split(), name


def folders(acct):
    """The folders worth showing, with a role (inbox, sent, spam...) and the number of unread messages."""
    with _lock(acct["email"]):
        c = _conn(acct)
        typ, data = c.list()
        found = {}
        for line in data or []:
            p = _parse_list(line)
            if not p:
                continue
            flags, name = p
            if "\\noselect" in flags:
                continue
            role = None
            for f in flags:
                if f in ROLES:
                    role = ROLES[f]
            if name.upper() == "INBOX":
                role = "inbox"
            if role == "important":
                continue
            if role and role not in found:
                found[role] = name
        out = []
        for r in ORDER:
            if r in found:
                unread = 0
                if r in ("inbox", "spam", "drafts"):
                    try:
                        typ, st = c.status(_quote(found[r]), "(UNSEEN)")
                        m = re.search(r"UNSEEN (\d+)", st[0].decode() if isinstance(st[0], bytes) else str(st[0]))
                        unread = int(m.group(1)) if m else 0
                    except Exception:
                        unread = 0
                out.append({"role": r, "title": TITLES[r], "name": found[r], "unread": unread})
        return out


def _select(c, folder, readonly=True):
    typ, data = c.select(_quote(folder), readonly=readonly)
    if typ != "OK":
        raise RuntimeError("Could not open the folder " + folder)
    return int(data[0] or 0)


def _flags(raw):
    f = raw.lower()
    return {"seen": "\\seen" in f, "starred": "\\flagged" in f}


def list_messages(acct, folder, page=0, per=30, query=""):
    with _lock(acct["email"]):
        c = _conn(acct)
        _select(c, folder)
        if query:
            q = query.replace('"', "")
            typ, data = c.uid("search", "CHARSET", "UTF-8", "OR", "OR", "FROM", _quote(q).encode(), "SUBJECT", _quote(q).encode(), "TEXT", _quote(q).encode())
        else:
            typ, data = c.uid("search", None, "ALL")
        uids = [int(x) for x in (data[0].split() if data and data[0] else [])]
        uids.sort(reverse=True)
        total = len(uids)
        chunk = uids[page * per:(page + 1) * per]
        out = []
        if chunk:
            typ, md = c.uid("fetch", ",".join(str(u) for u in chunk), "(FLAGS BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])")
            for item in md or []:
                if not isinstance(item, tuple):
                    continue
                meta = item[0].decode("utf-8", "replace")
                um = re.search(r"UID (\d+)", meta)
                fm = re.search(r"FLAGS \(([^)]*)\)", meta)
                if not um:
                    continue
                msg = email.message_from_bytes(item[1])
                name, addr = email.utils.parseaddr(_dec(msg.get("From")))
                try:
                    ts = email.utils.parsedate_to_datetime(msg["Date"]).timestamp() if msg.get("Date") else 0
                except Exception:
                    ts = 0
                to = email.utils.parseaddr(_dec(msg.get("To")))
                out.append({"uid": int(um.group(1)), "from_name": name or addr, "from": addr, "to": to[1] or to[0], "subject": _dec(msg.get("Subject")) or "(no subject)",
                            "ts": ts, **_flags(fm.group(1) if fm else "")})
            out.sort(key=lambda m: -m["uid"])
        return {"messages": out, "total": total, "page": page, "per": per}


def _body(msg):
    text, htm, atts = "", "", []
    for p in msg.walk():
        if p.is_multipart():
            continue
        ctype = p.get_content_type()
        fn = p.get_filename()
        if fn or (p.get("Content-Disposition") or "").lower().startswith("attachment"):
            atts.append({"name": _dec(fn) or "attachment", "type": ctype, "size": len(p.get_payload(decode=True) or b"")})
            continue
        try:
            payload = p.get_payload(decode=True) or b""
            s = payload.decode(p.get_content_charset() or "utf-8", "replace")
        except Exception:
            continue
        if ctype == "text/plain" and not text:
            text = s
        elif ctype == "text/html" and not htm:
            htm = s
    return text, htm, atts


def html_to_text(h):
    h = re.sub(r"(?is)<(script|style).*?</\1>", "", h)
    h = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</li>", "\n", h)
    return _html.unescape(re.sub(r"<[^>]+>", "", h)).strip()


def get_message(acct, folder, uid, mark_seen=True):
    with _lock(acct["email"]):
        c = _conn(acct)
        _select(c, folder, readonly=False)
        typ, md = c.uid("fetch", str(uid), "(FLAGS BODY.PEEK[])")
        raw = None
        for item in md or []:
            if isinstance(item, tuple):
                raw = item[1]
        if raw is None:
            raise RuntimeError("That message is gone")
        msg = email.message_from_bytes(raw)
        text, htm, atts = _body(msg)
        if mark_seen:
            c.uid("store", str(uid), "+FLAGS", "(\\Seen)")
        name, addr = email.utils.parseaddr(_dec(msg.get("From")))
        try:
            ts = email.utils.parsedate_to_datetime(msg["Date"]).timestamp() if msg.get("Date") else 0
        except Exception:
            ts = 0
        return {"uid": uid, "subject": _dec(msg.get("Subject")) or "(no subject)", "from_name": name or addr, "from": addr, "to": _dec(msg.get("To")),
                "cc": _dec(msg.get("Cc")), "ts": ts, "text": text or html_to_text(htm), "html": htm, "attachments": atts,
                "message_id": (msg.get("Message-ID") or "").strip(), "references": (msg.get("References") or "").strip()}


def attachment(acct, folder, uid, index):
    with _lock(acct["email"]):
        c = _conn(acct)
        _select(c, folder)
        typ, md = c.uid("fetch", str(uid), "(BODY.PEEK[])")
        raw = next((i[1] for i in md or [] if isinstance(i, tuple)), None)
        if raw is None:
            raise RuntimeError("That message is gone")
        msg = email.message_from_bytes(raw)
        n = 0
        for p in msg.walk():
            if p.is_multipart():
                continue
            if p.get_filename() or (p.get("Content-Disposition") or "").lower().startswith("attachment"):
                if n == index:
                    return _dec(p.get_filename()) or "attachment", p.get_content_type(), p.get_payload(decode=True) or b""
                n += 1
        raise RuntimeError("Attachment not found")


def act(acct, folder, uid, action, folders_list=None):
    """action: seen, unseen, star, unstar, delete, spam, notspam. Moves go to the folder with the right role."""
    with _lock(acct["email"]):
        c = _conn(acct)
        _select(c, folder, readonly=False)
        u = str(uid)
        if action in ("seen", "unseen"):
            c.uid("store", u, "+FLAGS" if action == "seen" else "-FLAGS", "(\\Seen)")
        elif action in ("star", "unstar"):
            c.uid("store", u, "+FLAGS" if action == "star" else "-FLAGS", "(\\Flagged)")
        elif action in ("delete", "spam", "notspam"):
            fl = folders_list or folders(acct)
            role = {"delete": "trash", "spam": "spam", "notspam": "inbox"}[action]
            dest = next((f["name"] for f in fl if f["role"] == role), None)
            if not dest:
                c.uid("store", u, "+FLAGS", "(\\Deleted)")
                c.expunge()
                return True
            if dest == folder and action == "delete":     # already in the trash: remove for good
                c.uid("store", u, "+FLAGS", "(\\Deleted)")
                c.expunge()
                return True
            typ, _ = c.uid("copy", u, _quote(dest))
            if typ != "OK":
                raise RuntimeError("Could not move the message")
            c.uid("store", u, "+FLAGS", "(\\Deleted)")
            c.expunge()
        else:
            raise RuntimeError("Unknown action")
        return True
