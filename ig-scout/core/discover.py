"""Find Instagram handles to check.

Sources, all used from the person's own logged-in session:
  1. Handles the person pastes in.
  2. Instagram's own search box, for  <niche> <city>.
  3. Instagram's "similar accounts" suggestions for every lead that is kept (see job.py).
"""
import random
import re
import time

from .countries import COUNTRIES, DEFAULT_NICHES

RESERVED = {"p", "reel", "reels", "explore", "stories", "tags", "tv", "accounts", "directory", "about", "legal",
            "developer", "web", "locations", "challenge", "direct", "popular", "hashtag", "share", "instagram"}
HANDLE_RE = re.compile(r"instagram\.com/([A-Za-z0-9._]{2,30})(?:[/?#]|$)")


def handles_in(text):
    out = []
    for m in HANDLE_RE.finditer(text or ""):
        h = m.group(1).strip(".")
        if h and h.lower() not in RESERVED:
            out.append(h)
    return out


def make_queries(country, keywords):
    """A shuffled list of (search_text, niche) pairs: each niche across each city."""
    niches = [k.strip() for k in keywords if k.strip()] or list(DEFAULT_NICHES)
    if country and country in COUNTRIES:
        cities = COUNTRIES[country]["search_cities"]
    else:
        cities = [c for d in COUNTRIES.values() for c in d["search_cities"][:2]]
    pairs = [(f"{n} {c}", n) for n in niches for c in cities]
    random.shuffle(pairs)
    return pairs


def instagram_search(engine, query):
    """Handles of accounts posting about the query, from Instagram's keyword search. Returns (handles, status)."""
    try:
        status, handles = engine.search(query)
    except Exception as e:
        engine.log(f"Search '{query}' failed: {type(e).__name__}: {e}")
        return [], 0
    engine.log(f"Search '{query}': {len(handles)} accounts" if handles else f"Search '{query}' returned nothing (status {status})")
    return handles, status


def candidates(engine, country, keywords, stop):
    """Yields (handle, niche_term, source) from Instagram search, one query at a time."""
    for text, niche in make_queries(country, keywords):
        if stop():
            return
        hs, status = instagram_search(engine, text)
        if status in (429, 401):
            yield None, status, "blocked"
            return
        for h in hs:
            yield h, niche, "instagram search"
        time.sleep(random.uniform(2.0, 4.0))
