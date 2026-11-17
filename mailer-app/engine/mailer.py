"""SMTP sending and IMAP syncing (reply, bounce and unsubscribe detection). Standard library only."""
import email
import email.utils
import imaplib
import re
import secrets
import smtplib
import ssl
from email.header import decode_header, make_header
from email.message import EmailMessage

from . import config, db, secrets_store

UNSUB_RE = re.compile(r"\b(unsubscribe|stop emailing|stop sending|remove me|do not email|don'?t (ever )?email|dont (ever )?email|take me off|توقف|إيقاف|ايقاف|لا ترسل)\b", re.I)
BOUNCE_FROM = re.compile(r"(mailer-daemon|postmaster|mail delivery)", re.I)
HARD_RE = re.compile(r"(550|551|552|553|554|5\.\d\.\d|address not found|user unknown|no such user|does not exist|couldn'?t be found|unable to receive|domain .*couldn'?t be found|message blocked)", re.I)
SOFT_RE = re.compile(r"(temporary problem|will retry|delivery incomplete|mailbox full|try again later|4\.\d\.\d)", re.I)
RECIP_RES = [
    re.compile(r"Final-Recipient:\s*rfc822;\s*([^\s<>;]+@[^\s<>;]+)", re.I),
    re.compile(r"(?:wasn'?t delivered to|delivering your message to|message to|couldn'?t be delivered to)\s+<?([^\s<>;,]+@[^\s<>;,.]+(?:\.[^\s<>;,.]+)+)", re.I),
]


def _dec(v):
    try:
        return str(make_header(decode_header(v or "")))
    except Exception:
        return v or ""


def body_text(msg):
    if msg.is_multipart():
        parts = []
        for p in msg.walk():
            if p.get_content_type() in ("text/plain", "message/delivery-status") and not p.get_filename():
                try:
                    payload = p.get_payload(decode=True)
                    if payload is None:
                        sub = p.get_payload()
                        payload = str(sub[0]).encode() if isinstance(sub, list) and sub else b""
                    parts.append(payload.decode(p.get_content_charset() or "utf-8", "replace"))
                except Exception:
                    pass
        return "\n".join(parts)
    payload = msg.get_payload(decode=True) or b""
    return payload.decode(msg.get_content_charset() or "utf-8", "replace")


def classify_incoming(from_addr, subject, body):
    """Returns ('bounce_hard'|'bounce_soft'|'unsub'|'reply', failed_recipient_or_None)."""
    text = f"{subject}\n{body}"
    if BOUNCE_FROM.search(from_addr or "") or re.search(r"delivery status notification|undeliverable|mail delivery failed", subject or "", re.I):
        rcpt = None
        for rx in RECIP_RES:
            m = rx.search(text)
            if m:
                rcpt = m.group(1).strip(".,;>)").lower()
                break
        if SOFT_RE.search(text) and not HARD_RE.search(text.replace("will retry", "")):
            return "bounce_soft", rcpt
        return "bounce_hard", rcpt
    first_part = body.split("\n>")[0][:600]
    if UNSUB_RE.search(first_part) or re.fullmatch(r"\s*stop[.! ]*\s*", first_part.splitlines()[0] if first_part.strip() else "", re.I):
        return "unsub", None
    return "reply", None


def build_message(acct, to_addr, subject, body, in_reply_to=None, references=None, track_base=None, token=None):
    msg = EmailMessage()
    msg["From"] = email.utils.formataddr((acct.get("display_name") or "", acct["email"]))
    msg["To"] = to_addr
    msg["Subject"] = subject
    domain = acct["email"].split("@")[-1]
    msg["Message-ID"] = email.utils.make_msgid(domain=domain)
    msg["Date"] = email.utils.formatdate(localtime=True)
    msg["List-Unsubscribe"] = f"<mailto:{acct['email']}?subject=stop>"
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = references or in_reply_to
    msg.set_content(body)
    if track_base and token:
        html = "<div style=\"white-space:pre-wrap\">" + body.replace("&", "&amp;").replace("<", "&lt;") + \
               f"</div><img src=\"{track_base.rstrip('/')}/o/{token}.gif\" width=\"1\" height=\"1\" alt=\"\">"
        msg.add_alternative(html, subtype="html")
    return msg


def smtp_send(acct, msg):
    pw = secrets_store.get_secret(acct["email"])
    if pw is None:
        raise RuntimeError(f"No saved password for {acct['email']}")
    host, port = acct["smtp_host"], int(acct["smtp_port"] or 587)
    ctx = ssl.create_default_context()
    if config.plain(host):
        s = smtplib.SMTP(host, port, timeout=60)
    elif port == 465:
        s = smtplib.SMTP_SSL(host, port, context=ctx, timeout=60)
    else:
        s = smtplib.SMTP(host, port, timeout=60)
        s.starttls(context=ctx)
    try:
        s.login(acct.get("username") or acct["email"], pw)
        s.send_message(msg)
    finally:
        try:
            s.quit()
        except Exception:
            pass


def friendly_error(e):
    t = str(e)
    if re.search(r"535|authentication|auth|invalid credentials|username and password|AUTHENTICATIONFAILED", t, re.I):
        return ("The sign-in was refused. For Gmail, you need an app password (16 letters), not your normal password. "
                "Turn on 2-Step Verification in your Google account, then create an app password and paste it here.")
    if re.search(r"getaddrinfo|name or service|timed out|timeout|unreachable|refused", t, re.I):
        return "Could not reach the mail server. Check your internet connection and try again."
    if re.search(r"imap.*(disabled|not enabled)|web login required", t, re.I):
        return "Turn on IMAP in the mail settings of your account, then try again."
    return t[:200]


def test_connection(acct):
    out = {"smtp": False, "imap": False, "error": ""}
    try:
        pw = secrets_store.get_secret(acct["email"])
        ctx = ssl.create_default_context()
        port = int(acct["smtp_port"] or 587)
        plain = config.plain(acct["smtp_host"])
        s = smtplib.SMTP_SSL(acct["smtp_host"], port, context=ctx, timeout=30) if (port == 465 and not plain) else smtplib.SMTP(acct["smtp_host"], port, timeout=30)
        if port != 465 and not plain:
            s.starttls(context=ctx)
        s.login(acct.get("username") or acct["email"], pw)
        s.quit()
        out["smtp"] = True
        m = imaplib.IMAP4(acct["imap_host"], int(acct["imap_port"] or 993), timeout=30) if config.plain(acct["imap_host"]) else imaplib.IMAP4_SSL(acct["imap_host"], int(acct["imap_port"] or 993), timeout=30)
        m.login(acct.get("username") or acct["email"], pw)
        m.logout()
        out["imap"] = True
    except Exception as e:
        out["error"] = friendly_error(e)
    return out


def apply_incoming(acct_id, msg, uid=None):
    """Store one parsed incoming message and update lead state. Returns kind."""
    from_addr = email.utils.parseaddr(_dec(msg.get("From")))[1].lower()
    subject = _dec(msg.get("Subject"))
    body = body_text(msg)
    mid = (msg.get("Message-ID") or "").strip()
    irt = (msg.get("In-Reply-To") or "").strip()
    refs = (msg.get("References") or "").strip()
    if mid and db.one("SELECT id FROM messages WHERE message_id=? AND direction='in'", (mid,)):
        return "dup"
    kind, rcpt = classify_incoming(from_addr, subject, body)
    lead = None
    if kind.startswith("bounce"):
        if rcpt:
            lead = db.one("SELECT * FROM leads WHERE email=?", (rcpt,))
        if kind == "bounce_hard" and rcpt:
            db.run("INSERT OR IGNORE INTO suppression(email,reason,ts) VALUES(?,?,?)", (rcpt, "hard bounce", db.now()))
            if lead:
                db.run("UPDATE leads SET status='bounced' WHERE id=?", (lead["id"],))
    else:
        lead = db.one("SELECT * FROM leads WHERE email=?", (from_addr,))
        if lead is None and (irt or refs):
            ids = (irt + " " + refs).split()
            for i in ids:
                m = db.one("SELECT lead_id FROM messages WHERE direction='out' AND message_id=?", (i,))
                if m and m["lead_id"]:
                    lead = db.one("SELECT * FROM leads WHERE id=?", (m["lead_id"],))
                    break
        if lead:
            new_status = "unsub" if kind == "unsub" else "replied"
            db.run("UPDATE leads SET status=? WHERE id=?", (new_status, lead["id"]))
            db.run("INSERT INTO events(lead_id,type,ts,detail) VALUES(?,?,?,?)", (lead["id"], kind, db.now(), subject))
        if kind == "unsub":
            addr = lead["email"] if lead else from_addr
            db.run("INSERT OR IGNORE INTO suppression(email,reason,ts) VALUES(?,?,?)", (addr, "unsubscribed", db.now()))
    if lead is None and kind in ("reply", "unsub"):
        return "other"          # mail that is not about any lead is never stored
    ts = email.utils.parsedate_to_datetime(msg["Date"]).timestamp() if msg.get("Date") else db.now()
    db.run("""INSERT INTO messages(account_id,lead_id,direction,kind,message_id,in_reply_to,refs,subject,body,to_addr,from_addr,ts,uid)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
           (acct_id, lead["id"] if lead else None, "in", kind, mid, irt, refs, subject, body[:20000],
            _dec(msg.get("To")), from_addr, ts, uid))
    return kind


def sync_account(acct, limit=200):
    """Pull new inbox mail over IMAP. Returns counts."""
    pw = secrets_store.get_secret(acct["email"])
    counts = {"new": 0, "reply": 0, "bounce_hard": 0, "bounce_soft": 0, "unsub": 0}
    m = imaplib.IMAP4(acct["imap_host"], int(acct["imap_port"] or 993), timeout=60) if config.plain(acct["imap_host"]) else imaplib.IMAP4_SSL(acct["imap_host"], int(acct["imap_port"] or 993), timeout=60)
    try:
        m.login(acct.get("username") or acct["email"], pw)
        m.select("INBOX", readonly=True)
        last = int(acct.get("last_imap_uid") or 0)
        if last == 0:
            # First sync: start from now. Old mail in the inbox is none of this app's business.
            typ, data = m.status("INBOX", "(UIDNEXT)")
            mm = re.search(r"UIDNEXT (\d+)", data[0].decode() if isinstance(data[0], bytes) else str(data[0]))
            if mm:
                top = int(mm.group(1)) - 1
            else:
                typ, data = m.uid("search", None, "ALL")
                ids = [int(x) for x in (data[0].split() if data and data[0] else [])]
                top = max(ids) if ids else 0
            db.run("UPDATE accounts SET last_imap_uid=? WHERE id=?", (top if top > 0 else -1, acct["id"]))   # -1 means: started, nothing yet
            return counts
        typ, data = m.uid("search", None, f"UID {max(1, last + 1)}:*")
        uids = [int(x) for x in (data[0].split() if data and data[0] else []) if int(x) > last][-limit:]
        top = last
        for uid in uids:
            typ, md = m.uid("fetch", str(uid), "(RFC822)")
            if typ != "OK" or not md or not md[0]:
                continue
            msg = email.message_from_bytes(md[0][1])
            k = apply_incoming(acct["id"], msg, uid)
            if k not in ("dup", "other"):
                counts["new"] += 1
                counts[k] = counts.get(k, 0) + 1
            top = max(top, uid)
        if top != last:
            db.run("UPDATE accounts SET last_imap_uid=? WHERE id=?", (top, acct["id"]))
    finally:
        try:
            m.logout()
        except Exception:
            pass
    return counts


def new_token():
    return secrets.token_urlsafe(12)
