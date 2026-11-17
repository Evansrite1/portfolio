"""Two small mail servers for the tests, speaking the real protocols on this computer: IMAP (folders, search, fetch, store,
copy, expunge) and SMTP (login and receive). They let the app's mail code run end to end without a real mailbox."""
import base64
import re
import socketserver
import threading
import time
from email.message import EmailMessage
import email.utils

FOLDERS = [("INBOX", ""), ("[Gmail]/Sent Mail", "\\Sent"), ("[Gmail]/Spam", "\\Junk"), ("[Gmail]/Trash", "\\Trash"), ("[Gmail]/Drafts", "\\Drafts")]


class Store:
    def __init__(self):
        self.boxes = {n: [] for n, _ in FOLDERS}
        self.next_uid = 1
        self.sent = []          # what SMTP received
        self.lock = threading.RLock()
        self.user, self.password = "me@test.local", "secretpass"

    def add(self, folder, msg, flags=()):
        with self.lock:
            uid = self.next_uid
            self.next_uid += 1
            self.boxes[folder].append({"uid": uid, "flags": set(flags), "raw": msg.as_bytes() if hasattr(msg, "as_bytes") else msg})
            return uid


def make_msg(frm, to, subject, body, extra=None, html=None):
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = frm, to, subject
    m["Date"] = email.utils.formatdate(time.time() - 60)
    m["Message-ID"] = email.utils.make_msgid(domain="test.local")
    for k, v in (extra or {}).items():
        m[k] = v
    m.set_content(body)
    if html:
        m.add_alternative(html, subtype="html")
    return m


def _toks(s):
    """Split an IMAP argument string into words, keeping quoted text and (lists) together."""
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c == " ":
            i += 1
        elif c == '"':
            j = i + 1
            buf = ""
            while j < len(s) and s[j] != '"':
                if s[j] == "\\":
                    j += 1
                buf += s[j]
                j += 1
            out.append(buf)
            i = j + 1
        elif c == "(":
            depth, j = 1, i + 1
            while j < len(s) and depth:
                depth += (s[j] == "(") - (s[j] == ")")
                j += 1
            out.append(s[i:j])
            i = j
        else:
            j = i
            while j < len(s) and s[j] != " ":
                j += 1
            out.append(s[i:j])
            i = j
    return out


class ImapHandler(socketserver.StreamRequestHandler):
    def send(self, s):
        self.wfile.write(s if isinstance(s, bytes) else s.encode("utf-8"))

    def handle(self):
        st = self.server.store
        self.sel = None
        self.send("* OK fake imap ready\r\n")
        while True:
            line = self.rfile.readline()
            if not line:
                return
            line = line.decode("utf-8", "replace").rstrip("\r\n")
            if not line:
                continue
            tag, _, rest = line.partition(" ")
            cmd, _, args = rest.partition(" ")
            cmd = cmd.upper()
            try:
                if cmd == "CAPABILITY":
                    self.send("* CAPABILITY IMAP4rev1\r\n%s OK done\r\n" % tag)
                elif cmd == "LOGIN":
                    t = _toks(args)
                    ok = t[0] == st.user and t[1] == st.password
                    self.send("%s %s\r\n" % (tag, "OK logged in" if ok else "NO [AUTHENTICATIONFAILED] Invalid credentials"))
                elif cmd == "NOOP":
                    self.send("%s OK\r\n" % tag)
                elif cmd == "LOGOUT":
                    self.send("* BYE\r\n%s OK bye\r\n" % tag)
                    return
                elif cmd == "LIST":
                    for n, fl in FOLDERS:
                        self.send('* LIST (\\HasNoChildren%s) "/" "%s"\r\n' % ((" " + fl) if fl else "", n))
                    self.send("%s OK done\r\n" % tag)
                elif cmd == "STATUS":
                    t = _toks(args)
                    box = st.boxes.get(t[0], [])
                    unseen = sum(1 for m in box if "\\Seen" not in m["flags"])
                    self.send('* STATUS "%s" (UNSEEN %d UIDNEXT %d)\r\n%s OK done\r\n' % (t[0], unseen, st.next_uid, tag))
                elif cmd in ("SELECT", "EXAMINE"):
                    name = _toks(args)[0]
                    if name not in st.boxes:
                        self.send("%s NO no such folder\r\n" % tag)
                    else:
                        self.sel = name
                        self.send("* %d EXISTS\r\n%s OK [READ-WRITE] done\r\n" % (len(st.boxes[name]), tag))
                elif cmd == "UID":
                    self.uid(tag, args)
                elif cmd == "EXPUNGE":
                    with st.lock:
                        st.boxes[self.sel] = [m for m in st.boxes[self.sel] if "\\Deleted" not in m["flags"]]
                    self.send("%s OK expunged\r\n" % tag)
                else:
                    self.send("%s BAD unknown\r\n" % tag)
            except Exception as e:  # noqa
                self.send("%s NO error %s\r\n" % (tag, e))

    def pick(self, spec):
        box = self.server.store.boxes[self.sel]
        wanted = set()
        for part in spec.split(","):
            if ":" in part:
                a, b = part.split(":")
                lo = int(a)
                hi = 10 ** 9 if b == "*" else int(b)
                wanted |= {m["uid"] for m in box if lo <= m["uid"] <= hi}
            else:
                wanted.add(int(part))
        return [m for m in box if m["uid"] in wanted]

    def uid(self, tag, args):
        st = self.server.store
        sub, _, rest = args.partition(" ")
        sub = sub.upper()
        box = st.boxes[self.sel]
        if sub == "SEARCH":
            t = _toks(rest)
            hits = box
            if "OR" in [x.upper() for x in t]:
                needle = [x for x in t if x.upper() not in ("CHARSET", "UTF-8", "OR", "FROM", "SUBJECT", "TEXT")][0].lower()
                hits = [m for m in box if needle in m["raw"].decode("utf-8", "replace").lower()]
            elif len(t) >= 2 and t[0].upper() == "UID":
                lo = int(t[1].split(":")[0])
                hits = [m for m in box if m["uid"] >= lo]
            self.send("* SEARCH %s\r\n%s OK done\r\n" % (" ".join(str(m["uid"]) for m in hits), tag))
        elif sub == "FETCH":
            spec, _, items = rest.partition(" ")
            for m in self.pick(spec):
                fl = "(%s)" % " ".join(sorted(m["flags"]))
                if "HEADER.FIELDS" in items:
                    raw = m["raw"]
                    head = raw.split(b"\r\n\r\n", 1)[0] if b"\r\n\r\n" in raw else raw.split(b"\n\n", 1)[0]
                    data = head + b"\r\n\r\n"
                    self.send(b"* 1 FETCH (UID %d FLAGS %s BODY[HEADER.FIELDS (FROM TO SUBJECT DATE)] {%d}\r\n" % (m["uid"], fl.encode(), len(data)) + data + b")\r\n")
                else:
                    data = m["raw"]
                    self.send(b"* 1 FETCH (UID %d FLAGS %s BODY[] {%d}\r\n" % (m["uid"], fl.encode(), len(data)) + data + b")\r\n")
            self.send("%s OK fetched\r\n" % tag)
        elif sub == "STORE":
            t = _toks(rest)
            for m in self.pick(t[0]):
                flags = {x for x in t[2].strip("()").split() if x}
                if t[1].startswith("+"):
                    m["flags"] |= flags
                else:
                    m["flags"] -= flags
            self.send("%s OK stored\r\n" % tag)
        elif sub == "COPY":
            t = _toks(rest)
            for m in self.pick(t[0]):
                st.add(t[1], m["raw"], m["flags"] - {"\\Deleted"})
            self.send("%s OK copied\r\n" % tag)
        else:
            self.send("%s BAD\r\n" % tag)


class SmtpHandler(socketserver.StreamRequestHandler):
    def send(self, s):
        self.wfile.write(s.encode())

    def handle(self):
        st = self.server.store
        self.send("220 fake smtp\r\n")
        frm, to = "", []
        while True:
            line = self.rfile.readline()
            if not line:
                return
            line = line.decode("utf-8", "replace").rstrip("\r\n")
            up = line.upper()
            if up.startswith("EHLO") or up.startswith("HELO"):
                self.send("250-fake\r\n250 AUTH PLAIN LOGIN\r\n")
            elif up.startswith("AUTH PLAIN"):
                parts = base64.b64decode(line.split()[2]).split(b"\0")
                ok = parts[1].decode() == st.user and parts[2].decode() == st.password
                self.send("235 ok\r\n" if ok else "535 5.7.8 authentication failed\r\n")
            elif up.startswith("AUTH LOGIN"):
                self.send("334 VXNlcm5hbWU6\r\n")
                u = base64.b64decode(self.rfile.readline().strip()).decode()
                self.send("334 UGFzc3dvcmQ6\r\n")
                p = base64.b64decode(self.rfile.readline().strip()).decode()
                self.send("235 ok\r\n" if (u == st.user and p == st.password) else "535 5.7.8 authentication failed\r\n")
            elif up.startswith("MAIL FROM"):
                frm = line.split(":", 1)[1].strip("<> ")
                to = []
                self.send("250 ok\r\n")
            elif up.startswith("RCPT TO"):
                to.append(line.split(":", 1)[1].strip("<> "))
                self.send("250 ok\r\n")
            elif up == "DATA":
                self.send("354 go\r\n")
                buf = []
                while True:
                    l = self.rfile.readline()
                    if l in (b".\r\n", b".\n", b""):
                        break
                    buf.append(l[1:] if l.startswith(b"..") else l)
                with st.lock:
                    st.sent.append({"from": frm, "to": list(to), "raw": b"".join(buf)})
                self.send("250 queued\r\n")
            elif up == "QUIT":
                self.send("221 bye\r\n")
                return
            else:
                self.send("250 ok\r\n")


class _Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def start():
    """Returns (store, imap_port, smtp_port, stop)."""
    st = Store()
    imap, smtp = _Server(("127.0.0.1", 0), ImapHandler), _Server(("127.0.0.1", 0), SmtpHandler)
    imap.store = smtp.store = st
    for s in (imap, smtp):
        threading.Thread(target=s.serve_forever, daemon=True).start()

    def stop():
        for s in (imap, smtp):
            s.shutdown()
            s.server_close()
    return st, imap.server_address[1], smtp.server_address[1], stop
