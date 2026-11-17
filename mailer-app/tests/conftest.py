import os
import sys
import tempfile

# set before the app code is imported: a private data folder, a fixed key, and plain (unencrypted) connections to the
# test mail servers on this computer only
os.environ.setdefault("MAILER_HOME", tempfile.mkdtemp())
os.environ.setdefault("MAILER_KEY", "testkey")
os.environ["MAILER_PLAIN_TEST"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
