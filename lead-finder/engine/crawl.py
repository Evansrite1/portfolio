"""Reading a business's own public website for the contact details it publishes: emails, phone numbers and its social links.
It opens the home page and the usual contact pages only, one small request each, with a pause between requests to one site.
If a page only shows its details after scripts run, the built-in browser (browser.py) opens it instead."""
import html as _html
import re
import time
from urllib.parse import urljoin, urlparse

import requests

UA = "Mozilla/5.0 (compatible; LargeLeadFinder/1.0; +https://evansademilua.vercel.app)"
PATHS = ("", "contact", "contact-us", "contacts", "about", "about-us", "get-in-touch")
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
JUNK = ("example.", "sentry", "wixpress", "domain.com", "yourdomain", "email.com", "@2x", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js",
        "godaddy", "schema.org", "w3.org", "your@", "name@", "user@")
IG = re.compile(r"instagram\.com/(?!p/|reel/|explore|accounts|about|developer|legal|stories|tv/)([A-Za-z0-9._]{2,30})", re.I)
FB = re.compile(r"facebook\.com/(?!sharer|share|plugins|tr\?|dialog|login|groups|events)([A-Za-z0-9.\-]{3,60})", re.I)
SOCIAL = {
    "twitter": re.compile(r"(?:twitter|x)\.com/(?!intent|share|home|i/|search|hashtag|login|signup|privacy|tos)@?([A-Za-z0-9_]{2,15})(?:[/?\"' ]|$)", re.I),
    "linkedin": re.compile(r"linkedin\.com/((?:company|in|school)/[A-Za-z0-9._%-]{2,80})", re.I),
    "tiktok": re.compile(r"tiktok\.com/(@[A-Za-z0-9._]{2,30})", re.I),
    "youtube": re.compile(r"youtube\.com/((?:@|channel/|c/|user/)[A-Za-z0-9._%-]{2,60})", re.I),
    "pinterest": re.compile(r"pinterest\.[a-z.]+/(?!pin/|pin$)([A-Za-z0-9_]{2,40})(?:[/?\"' ]|$)", re.I),
    "whatsapp": re.compile(r"(?:wa\.me/|api\.whatsapp\.com/send\?phone=|whatsapp\.com/send\?phone=)\+?(\d{8,15})", re.I),
    "telegram": re.compile(r"(?:t\.me|telegram\.me)/(?!share|joinchat)([A-Za-z0-9_]{4,32})", re.I),
    "threads": re.compile(r"threads\.net/(@[A-Za-z0-9._]{2,30})", re.I),
}
SOCIAL_URL = {"twitter": "https://x.com/%s", "linkedin": "https://www.linkedin.com/%s", "tiktok": "https://www.tiktok.com/%s", "youtube": "https://www.youtube.com/%s",
              "pinterest": "https://www.pinterest.com/%s/", "whatsapp": "https://wa.me/%s", "telegram": "https://t.me/%s", "threads": "https://www.threads.net/%s"}
PHONE = re.compile(r"(?:\+|00)\d[\d\s().-]{7,17}\d")


def deobfuscate(text):
    t = _html.unescape(text)
    t = re.sub(r"\s*[\[(]\s*at\s*[\])]\s*", "@", t, flags=re.I)
    t = re.sub(r"\s*[\[(]\s*dot\s*[\])]\s*", ".", t, flags=re.I)
    return t


def emails_in(text):
    out = []
    for m in EMAIL.finditer(deobfuscate(text)):
        e = m.group(0).lower().strip(".,;:<>()[]")
        if not any(j in e for j in JUNK) and e not in out:
            out.append(e)
    return out


def best_email(emails, domain=""):
    """The address most likely to reach the owner: one on the business's own domain first, a named person before info@."""
    generic = ("info", "contact", "hello", "admin", "sales", "support", "office", "enquiries", "inquiries", "mail", "service", "booking", "reservations")
    def score(e):
        local, _, dom = e.partition("@")
        s = 0
        if domain and domain.replace("www.", "") in dom:
            s += 4
        if local.split(".")[0].split("_")[0] not in generic:
            s += 2
        if dom in ("gmail.com", "yahoo.com", "outlook.com", "hotmail.com"):
            s += 1                                   # small businesses often use these for real
        return s
    return sorted(emails, key=score, reverse=True)


def parse_page(html, url=""):
    """Everything useful in one page. Returns dict(emails, instagram, facebook, phones, links)."""
    low = html or ""
    ig = []
    for m in IG.finditer(low):
        h = m.group(1).rstrip(".").lower()
        if h not in ig and h not in ("instagram", "share"):
            ig.append(h)
    fb = []
    for m in FB.finditer(low):
        h = m.group(1).rstrip(".")
        if h.lower() not in [x.lower() for x in fb]:
            fb.append(h)
    phones = []
    for m in PHONE.finditer(_html.unescape(re.sub(r"<[^>]+>", " ", low))):
        p = re.sub(r"[^\d+]", "", m.group(0))
        if 9 <= len(p) <= 16 and p not in phones:
            phones.append(p)
    socials = {}
    for k, rx in SOCIAL.items():
        m = rx.search(low)
        if m:
            socials[k] = SOCIAL_URL[k] % m.group(1)
    mailto = [x.lower() for x in re.findall(r"mailto:([^\"'?>\s]+)", low, re.I)]
    emails = []
    for e in mailto + emails_in(low):
        e = e.strip().lower()
        if EMAIL.fullmatch(e) and not any(j in e for j in JUNK) and e not in emails:
            emails.append(e)
    links = re.findall(r"href=[\"']([^\"'#]+)[\"']", low, re.I)
    return {"emails": emails, "instagram": ig, "facebook": fb, "phones": phones[:3], "links": links, "socials": socials}


def fetch(url, timeout=12):
    r = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "en"}, timeout=timeout, allow_redirects=True)
    ct = r.headers.get("content-type", "")
    if r.status_code >= 400 or ("html" not in ct and "text" not in ct):
        return ""
    return r.text[:600000]


def crawl_site(url, render=None, pause=0.6):
    """Look at the home page and contact pages of one website. render(url) is an optional function that returns the page after
    scripts ran (the built-in browser), used when the plain page held no email."""
    out = {"emails": [], "instagram": [], "facebook": [], "phones": [], "found_on": "", "socials": {}}
    host = urlparse(url).netloc
    if not host:
        return out
    tried = set()
    base = url if url.endswith("/") else url + "/"
    pages = [urljoin(base, p) for p in PATHS]
    for i, u in enumerate(pages):
        if u in tried:
            continue
        tried.add(u)
        try:
            html = fetch(u)
        except Exception:
            html = ""
        if i == 0 and not html:
            break                                           # the site itself does not answer
        if i == 0 and html:                                 # follow a link named contact, if the usual paths are not used
            for l in parse_page(html)["links"]:
                if re.search(r"contact", l, re.I) and not l.startswith(("mailto:", "tel:", "javascript")):
                    cu = urljoin(base, l)
                    if urlparse(cu).netloc == host and cu not in pages:
                        pages.insert(1, cu)
                        break
        info = parse_page(html, u)
        for k in ("emails", "instagram", "facebook", "phones"):
            for v in info[k]:
                if v not in out[k]:
                    out[k].append(v)
        for k, v in info["socials"].items():
            out["socials"].setdefault(k, v)
        if info["emails"] and not out["found_on"]:
            out["found_on"] = u
        if out["emails"] and i >= 2:
            break                                          # the home page and the contact pages are enough
        time.sleep(pause)
    if not out["emails"] and render:
        for u in pages[:3]:
            try:
                info = parse_page(render(u) or "", u)
            except Exception:
                continue
            for k in ("emails", "instagram", "facebook", "phones"):
                for v in info[k]:
                    if v not in out[k]:
                        out[k].append(v)
            if out["emails"]:
                out["found_on"] = u + " (browser)"
                break
    return out
