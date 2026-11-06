"""The message written for every lead. The person writes one template, the app fills it in for each business.

Placeholders (written in curly brackets):
    {first_name}  first name from the profile name, or "there" when there is no usable name
    {name}        the full profile name
    {handle}      the Instagram handle
    {niche}       what they do, for example "barber"
    {city}  {country}  {followers}  {instagram_link}  {website}  {website_detail}
A placeholder with no value is left empty. Anything else in curly brackets is left exactly as written.
"""
import re

PLACEHOLDERS = ["first_name", "name", "handle", "niche", "city", "country", "followers", "instagram_link", "website",
                "website_detail"]


BUSINESS_WORDS = {"the", "studio", "studios", "shop", "salon", "barber", "barbers", "barbershop", "cuts", "ink", "tattoo",
                  "tattoos", "co", "llc", "inc", "ltd", "designs", "design", "fitness", "gym", "bakery", "boutique", "clinic",
                  "spa", "nails", "beauty", "photography", "photo", "cleaning", "services", "service", "events", "event",
                  "catering", "kitchen", "cafe", "coffee", "restaurant", "academy", "agency", "group", "team", "official",
                  "and", "by", "of", "at", "lash", "lashes", "hair", "makeup", "mua", "yoga", "coaching", "coach", "wellness"}


def first_name(full):
    """A first name only when the profile name really looks like a person. Business names give 'there'."""
    full = (full or "").strip()
    words = [w for w in re.split(r"\s+", full) if w]
    if not words or len(words) > 3 or (len(full) > 3 and full.upper() == full) or re.search(r"[|@/&+0-9]", full):
        return "there"
    if any(re.sub(r"[^a-z]", "", w.lower()) in BUSINESS_WORDS for w in words):
        return "there"
    w = re.sub(r"[^A-Za-zÀ-ɏ'\-]", "", words[0])
    return w[:1].upper() + w[1:] if len(w) >= 2 else "there"


def render(template, row):
    if not (template or "").strip():
        return ""
    vals = {
        "first_name": first_name(row.get("name")), "name": (row.get("name") or "").strip(),
        "handle": row.get("handle", ""), "niche": row.get("niche", ""), "city": row.get("city", ""),
        "country": "" if row.get("country") == "Unknown" else row.get("country", ""),
        "followers": row.get("followers_text", ""), "instagram_link": row.get("instagram_link", ""),
        "website": row.get("website", ""), "website_detail": row.get("website_detail", ""),
    }
    out = re.sub(r"\{(\w+)\}", lambda m: str(vals[m.group(1)]) if m.group(1) in vals else m.group(0), template)
    out = re.sub(r"[ \t]+([,.!?])", r"\1", out)          # no space left before punctuation when a value was empty
    return re.sub(r"[ \t]{2,}", " ", out).strip()


# ---------------------------------------------------------------------------------------------------------------
# The automatic message, used when no custom template is saved. Same shape as the leads sheet:
#   Hello Name,  /  I came across your profile. <something true about their page>.  /  <the website paragraph>  /
#   Are you available for a quick call this week?
# Every sentence is built from facts the app found. Nothing says a post looked a certain way, because the app reads
# text, not pictures.
# ---------------------------------------------------------------------------------------------------------------
SEASONS = {"USA": "holiday", "Canada": "holiday", "UK": "holiday", "Australia": "holiday", "Nigeria": "festive",
           "UAE": "busy winter", "Kuwait": "busy winter", "Qatar": "busy winter", "Saudi Arabia": "busy winter",
           "South Africa": "summer holiday"}
FEEL = {"holiday": "light festive", "festive": "light festive", "busy winter": "fresh winter", "summer holiday": "fresh summer",
        "wedding": "fresh seasonal", "busy event": "fresh seasonal"}
KINDS = [
    (("coach", "trainer", "fitness", "yoga", "pilates", "therap", "wellness", "nutrition", "gym"),
     dict(work="coaching", result="clients", action="see your services and get in touch")),
    (("bakery", "cake", "restaurant", "cafe", "coffee", "cater", "food", "kitchen", "chef", "pastry"),
     dict(work="menu", result="orders", action="see your menu and order")),
    (("real estate", "realtor", "propert", "villa", "apartment"),
     dict(work="listings", result="inquiries", action="see your listings and inquire")),
    (("tattoo", "barber", "hair", "salon", "nail", "lash", "brow", "makeup", "mua", "loc", "braid", "massage", "spa",
      "photograph", "piercing", "aesthetic", "skin", "beauty", "stylist"),
     dict(work="work", result="bookings", action="see your services and book")),
]
BOOKING_TOOLS = ("booksy", "vagaro", "fresha", "styleseat", "square", "calendly", "squire", "as.me", "acuity", "setmore",
                 "glossgenius", "schedulicity", "booking")


def _kind(niche, category):
    blob = f"{niche} {category}".lower()
    for words, k in KINDS:
        if any(w in blob for w in words):
            return dict(k)
    return dict(work="work", result="customers", action="see your services and get in touch")


def _season(row, niche):
    n = (niche or "").lower()
    if "wedding" in n or "bridal" in n:
        return "wedding"
    if any(w in n for w in ("event", "planner", "decor")):
        return "busy event"
    return SEASONS.get(row.get("country"), "holiday")


def _compliment(row, niche):
    ppm = float(row.get("posts_per_month") or 0)
    posts = int(row.get("posts") or 0)
    if niche and row.get("active") == "Yes" and ppm >= 3:
        return f"Your {niche} page stays active, and steady posting like that builds trust."
    if niche and posts >= 100:
        return f"More than {500 if posts >= 500 else 100} posts on your {niche} page is a real body of work."
    if niche:
        return f"Your {niche} page makes it clear what you do and who it is for."
    return "Your page makes it clear what you do and who it is for."


def auto_message(row):
    niche = (row.get("niche") or "").strip().lower()
    kind = _kind(niche, row.get("category", ""))
    season = _season(row, niche)
    feel = FEEL.get(season, "fresh seasonal")
    first = first_name(row.get("name"))
    greeting = f"Hello {first}," if first != "there" else "Hello,"
    detail = (row.get("website_detail") or "")
    low = detail.lower()
    domain = row.get("domain", "")
    last = niche.split()[-1] if niche else ""
    if niche and last in ("office", "business", "shop", "studio", "salon", "store", "agency", "company", "clinic", "brand", "kitchen"):
        business = niche
    else:
        business = f"{niche} business" if niche and len(niche.split()) <= 3 else "business"
    action = kind["action"]
    if "whatsapp" in low:
        action = f"see your {kind['work'] if kind['work'] != 'work' else 'services'} and inquire instead of going back and forth on WhatsApp"
    elif any(b in low for b in BOOKING_TOOLS) and kind["result"] == "bookings":
        action = "see your services and book"
    ending = "I would love to show it to you."
    if row.get("has_website") == "Yes" and row.get("site_status") == "live":
        who = f"I saw your {row['platform']} website." if row.get("platform") else (
            f"I saw your website, {domain}." if domain else "I saw your website.")
        site = (f"{who} I redesigned it with a {feel} feel, so it shows your {kind['work']} to more people and turns more "
                f"of them into {kind['result']} this {season} season. {ending}")
    elif row.get("has_website") == "Yes":
        site = (f"I tried to open your website{', ' + domain if domain else ''}, and it is not loading right now. "
                f"I built a new website for your {business}. It can show your {kind['work']} to more people and give clients "
                f"one clear place to {action}, ready for the {season} season. {ending}")
    else:
        site = (f"I built a website for your {business}. It can show your {kind['work']} to more people and give clients "
                f"one clear place to {action}, ready for the {season} season. {ending}")
    return (f"{greeting}\n\nI came across your profile. {_compliment(row, niche)}\n\n{site}\n\n"
            f"Are you available for a quick call this week?")


def message_for(template, row):
    """The person's own template when one is saved, otherwise the automatic message."""
    return render(template, row) if (template or "").strip() else auto_message(row)
