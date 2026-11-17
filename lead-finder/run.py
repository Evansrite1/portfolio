"""Run from source: python run.py   (prints the address to open)"""
import os
from engine import server

if __name__ == "__main__":
    port = int(os.environ.get("LLF_PORT") or 8797)
    srv = server.make_server("127.0.0.1", port)
    print("Open: http://127.0.0.1:%d/?k=%s" % (port, server.KEY), flush=True)
    srv.serve_forever()
