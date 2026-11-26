"""Writes tools/second-screen-presenter/bundle.json: the list of pages and files the Presenter app keeps inside itself.
The app compares this list with its own copy and offers "Update now" when something changed. Run it after changing any Presenter file:
    python make_bundle.py
"""
import hashlib, json, os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
INCLUDE_DIRS = ['tools/second-screen-presenter/app', 'tools/second-screen-presenter/display', 'tools/second-screen-presenter/remote', 'tools/second-screen-presenter/camera',
                'tools/second-screen-presenter/backgrounds', 'tools/vendor/peerjs', 'tools/vendor/pdfjs', 'tools/vendor/bible', 'tools/vendor/whisper/tiny']
INCLUDE_FILES = ['tools/second-screen-presenter/icon-192.png', 'tools/second-screen-presenter/icon-512.png', 'tools/second-screen-presenter/hymns.json',
                 'tools/second-screen-presenter/manifest.webmanifest', 'tools/second-screen-presenter/sw.js',
                 'tools/ssapp.js', 'tools/whisper-worker.js', 'tools/voice-sw.js', 'tools/appdl.js', 'tools/presenter-download.js', 'tools/vendor/qrcode.js',
                 'tools/vendor/transformers/transformers.min.js', 'tools/vendor/transformers/ort-wasm-simd-threaded.jsep.mjs', 'tools/vendor/transformers/ort-wasm-simd-threaded.jsep.wasm']
def sha1(p):
    h = hashlib.sha1()
    with open(p, 'rb') as f:
        for c in iter(lambda: f.read(1 << 20), b''): h.update(c)
    return h.hexdigest()
files = {}
def add(rel):
    p = os.path.join(ROOT, rel)
    if os.path.isfile(p): files['/' + rel.replace(os.sep, '/')] = '%s:%d' % (sha1(p), os.path.getsize(p))
    else: print('missing', rel)
for d in INCLUDE_DIRS:
    for dp, _, fs in os.walk(os.path.join(ROOT, d)):
        for fn in fs: add(os.path.relpath(os.path.join(dp, fn), ROOT))
for f in INCLUDE_FILES: add(f)
v = hashlib.sha1(json.dumps(files, sort_keys=True).encode()).hexdigest()[:12]
out = os.path.join(ROOT, 'tools', 'second-screen-presenter', 'bundle.json')
json.dump({'v': v, 'files': files}, open(out, 'w', newline='\n'), separators=(',', ':'), sort_keys=True)
tot = sum(int(x.split(':')[1]) for x in files.values())
print('bundle %s: %d files, %.1f MB' % (v, len(files), tot / 1048576))
