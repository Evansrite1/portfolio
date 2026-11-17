"""Paths and constants. Everything stays on this computer, in the user's own AppData folder."""
import os
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_local = os.environ.get("LOCALAPPDATA") or str(Path.home() / ".local" / "share")
DATA_DIR = os.environ.get("MAILER_HOME") or os.path.join(_local, "OutreachMailer")
DB_PATH = os.path.join(DATA_DIR, "mailer.db")
SECRETS_PATH = os.path.join(DATA_DIR, "secrets.bin.json")

# Where the open-tracking pixel lives. Replies, bounces and opt-outs never need it (they come from the mailbox itself).
DEFAULT_TRACKER = "https://evansademilua.vercel.app"

# Gmail allows about 500 emails a day from a normal account and 2000 from Google Workspace. The app stays far below that.
RAMP_START = 10        # sends/day on day 1 of a new mailbox
RAMP_STEP = 5          # added every RAMP_EVERY_DAYS
RAMP_EVERY_DAYS = 2
DEFAULT_DAILY_CAP = 40
HARD_DAILY_CAP = 300
MAX_ACCOUNTS = 5

SEND_WINDOW = (8, 18)  # local hours emails may go out
FOLLOWUP_AFTER_DAYS = 5
MAX_FOLLOWUPS = 1

PRESETS = {
    "gmail": {"smtp_host": "smtp.gmail.com", "smtp_port": 587, "imap_host": "imap.gmail.com", "imap_port": 993},
    "outlook": {"smtp_host": "smtp.office365.com", "smtp_port": 587, "imap_host": "outlook.office365.com", "imap_port": 993},
    "yahoo": {"smtp_host": "smtp.mail.yahoo.com", "smtp_port": 587, "imap_host": "imap.mail.yahoo.com", "imap_port": 993},
}

# The tests start small mail servers on this computer without encryption. Real mailboxes always use encryption.
PLAIN_TEST = os.environ.get("MAILER_PLAIN_TEST") == "1"


def plain(host):
    return PLAIN_TEST and host in ("127.0.0.1", "localhost")


os.makedirs(DATA_DIR, exist_ok=True)
