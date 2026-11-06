"""Decide whether a business really has a website of its own, and describe it the way the leads sheet does.

Examples of what comes back:
    Yes. Wix, hiddengem.com
    Yes. thekeitoalignment.com, platform unknown
    No. Linktree has only text, TikTok, YouTube
    No. no link
"""
import re
from urllib.parse import urlparse, unquote, parse_qs

import requests
from bs4 import BeautifulSoup

from .countries import LINK_HUBS, NOT_A_SITE

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"}

PLATFORMS = [
    ("Wix", ["wixstatic.com", "wix.com/", "x-wix-"]),
    ("Squarespace", ["squarespace.com", "squarespace-cdn", "static1.squarespace"]),
    ("Shopify", ["cdn.shopify.com", "myshopify.com", "shopify.theme"]),
    ("GoDaddy", ["img1.wsimg.com", "godaddy.com/websites", "websitebuilder"]),
    ("Weebly", ["weebly.com", "editmysite.com"]),
    ("Webflow", ["webflow.com", "assets.website-files.com", "data-wf-"]),
    ("Framer", ["framerusercontent.com", "framer.com"]),
    ("Carrd", ["carrd.co"]),
    ("Duda", ["multiscreensite.com", "dudaone"]),
    ("WordPress", ["wp-content", "wp-includes", "wordpress"]),
    ("Joomla", ["/media/jui/", "joomla"]),
    ("Ghost", ["ghost.io", "content=\"ghost"]),
]

PARKED = ["this domain is for sale", "buy this domain", "domain is parked", "domain may be for sale",
          "this site can't be reached", "account suspended", "website expired", "coming soon", "under construction"]

HUB_NAMES = {"linktr.ee": "Linktree", "linktree.com": "Linktree", "beacons.ai": "Beacons", "bio.link": "Bio.link",
             "linkin.bio": "Linkin.bio", "lnk.bio": "Lnk.bio", "solo.to": "Solo.to", "campsite.bio": "Campsite",
             "taplink.cc": "Taplink", "stan.store": "Stan", "carrd.co": "Carrd", "allmylinks.com": "AllMyLinks",
             "linkpop.com": "Linkpop", "flow.page": "Flow", "bio.site": "Bio.site"}

_session = requests.Session()
_session.headers.update(HEADERS)


def _host(url):
    h = urlparse(url).netloc.lower().split("@")[-1].split(":")[0]
    return h[4:] if h.startswith("www.") else h


def _match(host, domains):
    return any(host == d or host.endswith("." + d) for d in domains)


def clean_url(u):
    """Unwrap Instagram's redirect links and add a scheme."""
    if not u:
        return ""
    u = u.strip()
    if "l.instagram.com" in u and "u=" in u:
        q = parse_qs(urlparse(u).query).get("u")
        if q:
            u = unquote(q[0])
    if not re.match(r"^https?://", u, re.I):
        u = "https://" + u
    return u


def detect_platform(html, headers):
    blob = (html[:200000] + " " + " ".join(f"{k}:{v}" for k, v in headers.items())).lower()
    for name, sigs in PLATFORMS:
        if any(s in blob for s in sigs):
            return name
    return ""


def probe(url):
    """Fetch one site. Returns dict(ok, status, platform, final, note, title)."""
    out = {"ok": False, "status": 0, "platform": "", "final": url, "note": "", "title": ""}
    try:
        r = _session.get(url, timeout=9, allow_redirects=True)
    except requests.exceptions.SSLError:
        try:
            r = _session.get(url, timeout=9, allow_redirects=True, verify=False)
            out["note"] = "certificate problem"
        except Exception:
            out["note"] = "certificate problem"
            return out
    except requests.exceptions.ConnectionError:
        out["note"] = "domain does not load"
        return out
    except requests.exceptions.Timeout:
        out["note"] = "timed out"
        return out
    except Exception as e:  # noqa
        out["note"] = type(e).__name__
        return out
    out["status"] = r.status_code
    out["final"] = r.url
    text = r.text if "text" in r.headers.get("content-type", "text") else ""
    out["platform"] = detect_platform(text, r.headers)
    m = re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)
    out["title"] = re.sub(r"\s+", " ", m.group(1)).strip()[:80] if m else ""
    low = text[:60000].lower()
    if r.status_code in (401, 403, 429, 503, 999):
        out["ok"] = True
        out["note"] = "blocks automated checks"
    elif r.status_code >= 400:
        out["note"] = f"returns {r.status_code}"
    elif any(p in low for p in PARKED) and len(text) < 40000:
        out["note"] = "parked or coming soon"
    else:
        out["ok"] = True
    return out


def read_hub(url):
    """Open a link-in-bio page and list what it links to. Returns (real_sites, kinds_seen)."""
    sites, kinds = [], []
    try:
        r = _session.get(url, timeout=9)
        html = r.text
    except Exception:
        return [], []
    soup = BeautifulSoup(html, "html.parser")
    hrefs = {a.get("href") for a in soup.find_all("a") if a.get("href")}
    # Many hubs ship their links inside JSON instead of anchors.
    hrefs |= set(re.findall(r'"(?:url|href|link)"\s*:\s*"(https?:[^"]+)"', html))
    for h in hrefs:
        h = h.replace("\\u002F", "/").replace("\\/", "/")
        if not h.startswith("http"):
            continue
        host = _host(h)
        if not host or _match(host, LINK_HUBS) or host in ("w3.org", "schema.org"):
            continue
        if _match(host, NOT_A_SITE):
            name = _kind(host) or host
            if name and name not in kinds:
                kinds.append(name)
        else:
            sites.append(h)
    return sites, kinds


def _kind(host):
    table = {"tiktok.com": "TikTok", "youtube.com": "YouTube", "youtu.be": "YouTube", "facebook.com": "Facebook",
             "fb.com": "Facebook", "wa.me": "WhatsApp", "whatsapp.com": "WhatsApp", "twitter.com": "X", "x.com": "X",
             "snapchat.com": "Snapchat", "pinterest.com": "Pinterest", "linkedin.com": "LinkedIn", "booksy.com": "Booksy",
             "vagaro.com": "Vagaro", "fresha.com": "Fresha", "styleseat.com": "StyleSeat", "square.site": "Square page",
             "squareup.com": "Square page", "calendly.com": "Calendly", "cash.app": "Cash App", "venmo.com": "Venmo",
             "paypal.me": "PayPal", "etsy.com": "Etsy", "spotify.com": "Spotify", "instagram.com": "Instagram",
             "t.me": "Telegram", "threads.net": "Threads"}
    for d, n in table.items():
        if host == d or host.endswith("." + d):
            return n
    return ""


def analyze(urls):
    """urls: list of raw links from the bio. Returns dict(has_website, website_detail, website, site_status)."""
    urls = [clean_url(u) for u in urls if u]
    res = {"has_website": "No", "website_detail": "No. no link", "website": "", "site_status": "", "platform": "", "domain": ""}
    if not urls:
        return res
    hubs_kinds, hub_name, candidates = [], "", []
    for u in urls:
        host = _host(u)
        if not host:
            continue
        if _match(host, LINK_HUBS):
            hub_name = HUB_NAMES.get(host, hub_name or "link page")
            sites, kinds = read_hub(u)
            candidates += sites
            hubs_kinds += [k for k in kinds if k not in hubs_kinds]
        elif _match(host, NOT_A_SITE):
            k = _kind(host) or host
            if k and k not in hubs_kinds:
                hubs_kinds.append(k)
        else:
            candidates.append(u)
    seen, uniq = set(), []
    for c in candidates:
        key = _host(c)
        if key not in seen:
            seen.add(key)
            uniq.append(c)
    if not uniq:
        if hub_name:
            res["website_detail"] = f"No. {hub_name} has only " + ", ".join(hubs_kinds or ["text"])
        elif hubs_kinds:
            res["website_detail"] = "No. link goes to " + ", ".join(hubs_kinds)
        return res
    # Probe the first candidate that actually loads; if none load, report the first.
    best = None
    for c in uniq[:3]:
        p = probe(c)
        if best is None:
            best = (c, p)
        if p["ok"]:
            best = (c, p)
            break
    c, p = best
    dom = _host(p["final"]) or _host(c)
    res["has_website"] = "Yes"
    res["platform"], res["domain"] = p["platform"], dom
    res["website"] = p["final"] if p["ok"] else c
    if p["ok"]:
        res["site_status"] = "live"
        res["website_detail"] = f"Yes. {p['platform']}, {dom}" if p["platform"] else f"Yes. {dom}, platform unknown"
    else:
        res["site_status"] = "down"
        res["website_detail"] = f"Yes, but not working. {dom} {p['note']}"
    return res
