"""Run from source for development: python run.py   (opens http://127.0.0.1:8791/?k=<key> printed below)"""
import os
import sys
from engine import server

if __name__ == "__main__":
    port = int(os.environ.get("MAILER_PORT") or 8791)
    srv = server.make_server("127.0.0.1", port)
    print(f"Open: http://127.0.0.1:{port}/?k={server.KEY}", flush=True)
    srv.serve_forever()
