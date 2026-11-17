"""Starts the app against the small test mail servers, with some mail in them, so the screens can be tried by hand.
    python tests/demo_server.py      then open the address it prints"""
import os
import sys
import tempfile

os.environ["MAILER_HOME"] = tempfile.mkdtemp()
os.environ["MAILER_KEY"] = "devkey"
os.environ["MAILER_PLAIN_TEST"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fakemail  # noqa: E402
from engine import db, server  # noqa: E402

st, ip, sp, stop = fakemail.start()
for i, (n, a, sub, body) in enumerate([("Ann Lee", "ann@cafe.com", "Re: a quick idea for Ann Cafe", "Yes, call me tomorrow please."),
                                       ("Bob Stone", "bob@gym.com", "Question about pricing", "How much for the full build?"),
                                       ("Newsletter", "news@shop.com", "Big sale this weekend", "Everything half price.")]):
    m = fakemail.make_msg("%s <%s>" % (n, a), st.user, sub, body, html="<p>%s <b>bold</b></p><img src='https://example.com/t.gif'>" % body if i == 2 else None)
    st.add("INBOX", m, flags=["\\Seen"] if i == 2 else [])
st.add("[Gmail]/Spam", fakemail.make_msg("Prince <p@scam.com>", st.user, "You won", "send money"))

app = server.create_app()
c = app.test_client()
H = {"X-Mailer-Key": "devkey"}
c.post("/api/accounts", headers=H, json={"email": st.user, "password": st.password, "provider": "gmail", "smtp_host": "127.0.0.1", "smtp_port": sp, "imap_host": "127.0.0.1", "imap_port": ip})
c.post("/api/settings", headers=H, json={"sender_name": "Evans"})
port = int(os.environ.get("MAILER_PORT") or 8795)
srv = server.make_server("127.0.0.1", port)
print("Open: http://127.0.0.1:%d/?k=devkey" % port, flush=True)
srv.serve_forever()
