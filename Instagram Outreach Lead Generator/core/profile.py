"""Turn Instagram's profile data into one lead row.

The raw data comes from Instagram's own profile endpoint, fetched inside the logged-in browser (see engine.py).
This file only reads that data. Fields Instagram does not show stay blank. Nothing is guessed.
"""
import json
import re
import time
from datetime import datetime, timezone

from .countries import COUNTRIES


def human(n):
    """5000 -> 5.0K, 1200000 -> 1.2M (the format the leads sheet uses)."""
    if n is None:
        return ""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1000:
        return f"{n / 1000:.1f}K"
    return str(n)


def _iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d") if ts else ""


def read_user(user, edges=None):
    """user: the profile data Instagram's page loads. edges: the recent posts it loads. Returns a plain dict or None."""
    if not user or not user.get("username"):
        return None
    posts = []
    for e in edges or []:
        n = e.get("node", {})
        cap = (n.get("caption") or {}).get("text", "") if isinstance(n.get("caption"), dict) else ""
        loc = (n.get("location") or {}).get("name", "") if isinstance(n.get("location"), dict) else ""
        posts.append({"ts": n.get("taken_at"), "likes": n.get("like_count"), "comments": n.get("comment_count"),
                      "caption": cap or "", "location": loc or "",
                      "pinned": bool(n.get("timeline_pinned_user_ids"))})
    addr = {k: user.get(k) for k in ("city_name", "address_street", "zip") if user.get(k)}
    links = []
    for x in user.get("bio_links") or []:
        u = x.get("url") or x.get("lynx_url")
        if u and u not in links:
            links.append(u)
    if user.get("external_url") and user["external_url"] not in links:
        links.insert(0, user["external_url"])
    return {
        "id": user.get("id") or user.get("pk") or "",
        "handle": user.get("username", ""),
        "name": user.get("full_name", ""),
        "bio": (user.get("biography") or "").replace("\r", ""),
        "category": user.get("category") or "",
        "followers": user.get("follower_count"),
        "following": user.get("following_count"),
        "post_count": user.get("media_count"),
        "private": bool(user.get("is_private")),
        "verified": bool(user.get("is_verified")),
        "business": bool(user.get("is_business") or user.get("is_professional_account")
                         or user.get("account_type") in (2, 3) or user.get("category")),
        "email": user.get("public_email") or "",
        "phone": user.get("contact_phone_number") or "",
        "address": addr,
        "links": links,
        "posts": posts,
    }


def find_email(bio):
    m = re.search(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", bio or "")
    return m.group(0) if m else ""


def find_phone(bio):
    m = re.search(r"(\+\d[\d\s\-().]{7,16}\d)", bio or "")
    return m.group(1).strip() if m else ""


def guess_country(u, website_url=""):
    """Return (country, why). Uses real signals only, strongest first. Unknown when nothing points anywhere."""
    addr = u.get("address") or {}
    text_addr = " ".join(str(v) for v in addr.values()).lower()
    if text_addr:
        for c, d in COUNTRIES.items():
            if any(w in text_addr for w in d["words"]) or any(ci in text_addr for ci in d["cities"] if len(ci) > 3):
                return c, "business address"
    phones = " ".join([u.get("phone", ""), find_phone(u.get("bio", ""))]).replace(" ", "")
    if phones.strip():
        for c, d in COUNTRIES.items():
            if any(phones.startswith(p) or (" " + p) in (" " + phones) for p in d["phone"]):
                return c, "phone code"
    bio = (u.get("bio") or "").lower()
    for c, d in COUNTRIES.items():
        if d["flag"] in (u.get("bio") or "") or d["flag"] in (u.get("name") or ""):
            return c, "flag in bio"
    tags = " ".join(p["location"] for p in u.get("posts", []) if p.get("location")).lower()
    for src, label in ((bio, "bio"), (tags, "post location")):
        if not src:
            continue
        for c, d in COUNTRIES.items():
            hits = [w for w in d["words"] if re.search(rf"\b{re.escape(w)}\b", src)]
            hits += [ci for ci in d["cities"] if len(ci) > 3 and re.search(rf"\b{re.escape(ci)}\b", src)]
            if hits:
                return c, f"{label}: {hits[0]}"
    host = re.sub(r"^https?://", "", website_url or "").split("/")[0].lower()
    for c, d in COUNTRIES.items():
        if any(host.endswith(t) for t in d["tld"]):
            return c, "website domain"
    return "Unknown", ""


def city_of(u, country):
    """Best city name from the address, a post location, or the bio."""
    addr = u.get("address") or {}
    if addr.get("city_name"):
        return addr["city_name"]
    pool = (" ".join(p["location"] for p in u.get("posts", []) if p.get("location")) + " " + (u.get("bio") or "")).lower()
    cities = COUNTRIES.get(country, {}).get("cities", [])
    for ci in sorted(cities, key=len, reverse=True):
        if len(ci) > 3 and re.search(rf"\b{re.escape(ci)}\b", pool):
            return ci.title()
    return ""


GENERIC_CATEGORIES = {"personal blog", "blogger", "public figure", "creator", "digital creator", "artist", "community",
                      "product/service", "local business", "small business", "brand", "entrepreneur", "interest",
                      "health/beauty", "beauty, cosmetic & personal care", "shopping & retail", "e-commerce website",
                      "website", "just for fun", "personal"}


def niche_of(u, search_term=""):
    """A short noun for what they do: their Instagram category when it says something specific. Vague categories
    ("Product/service", "Beauty, cosmetic & personal care") give way to the search term that found them, but only when
    their own bio, name or captions mention it, so a lead is never labelled with something they do not do."""
    cat = (u.get("category") or "").strip()
    if cat and cat.lower() not in GENERIC_CATEGORIES:
        return cat.lower()
    blob = " ".join([u.get("bio", ""), u.get("name", "")] + [p.get("caption", "")[:200] for p in u.get("posts", [])[:6]]).lower()
    if search_term and any(w in blob for w in search_term.lower().split()):
        return search_term
    return cat.lower() if cat and len(cat) <= 24 and "," not in cat and "&" not in cat else ""


def recent_posts(u):
    """The posts people see first as new, newest first. Pinned posts are skipped: they sit at the top of the grid
    whatever their age, so they say nothing about how recently the account posted."""
    return sorted((p for p in u.get("posts", []) if p.get("ts") and not p.get("pinned")),
                  key=lambda p: p["ts"], reverse=True)


def track_record(u):
    """Facts a human can check. Everything here ignores pinned posts."""
    posts = recent_posts(u)
    out = {"last_post": "", "last_3_post_dates": "", "first_visible_post": "", "posts_per_month": "", "top_post_likes": "",
           "active": ""}
    if not posts:
        return out
    ts = [p["ts"] for p in posts]
    out["last_post"] = _iso(ts[0])
    out["last_3_post_dates"] = " | ".join(_iso(t) for t in ts[:3])
    out["first_visible_post"] = _iso(ts[-1])
    span_days = max((ts[0] - ts[-1]) / 86400, 1)
    if len(ts) >= 3:
        out["posts_per_month"] = f"{len(ts) / span_days * 30:.1f}"
    likes = [p["likes"] for p in posts if isinstance(p.get("likes"), int) and p["likes"] >= 0]
    if likes:
        out["top_post_likes"] = max(likes)
    days_since = (time.time() - ts[0]) / 86400
    out["active"] = "Yes" if days_since <= 45 else ("Slow" if days_since <= 150 else "Inactive")
    return out


def summary(u, country, city, niche):
    """The 'what_they_do' cell, in the sheet's style: niche, city, followers."""
    bits = [b for b in (niche, city or (country if country != "Unknown" else ""), human(u.get("followers"))) if b]
    return ", ".join(bits)
