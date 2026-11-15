"""The message written for every lead (IG Leads Finder). The person writes one template, the app fills it in for each business.

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
# The automatic message, used when the person has not saved their own. Short, in the shape of a friendly first message:
#   Hello Name,  /  I came across your page. <something true about it>.  /  <one true observation>  /  <what the person
#   offers>  /  Would you be open to a quick call this week?
# Every sentence is built from facts the app found (links, post dates, bio). It never says a thing has been built or
# prepared, and it never says what a post looked like, because the app reads text, not pictures.
# ---------------------------------------------------------------------------------------------------------------
from . import services as S


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


def _observation(service, row):
    detail = (row.get("website_detail") or "")
    domain = row.get("domain", "")
    if service == "website":
        return "I noticed your profile does not link to a website." if row.get("has_website") == "No" else ""
    if service == "redesign":
        if row.get("has_website") != "Yes":
            return ""
        who = f"I had a look at your website, {domain}." if domain else "I had a look at your website."
        if row.get("site_status") and row.get("site_status") != "live":
            who += " It did not load when I tried."
        return who
    if service == "social":
        last = row.get("last_post")
        if last and row.get("active") in ("Slow", "Inactive"):
            return f"I noticed the last post on the page was on {last}."
        ppm = row.get("posts_per_month")
        if ppm:
            return f"I noticed the page posts about {ppm} times a month."
        return ""
    if service == "booking":
        return "I could not find a booking or ordering link on your profile."
    return ""


def auto_message(row):
    niche = (row.get("niche") or "").strip().lower()
    service = row.get("service") or S.DEFAULT_SERVICE
    offer = (row.get("offer") or S.get(service)["offer"] or "").strip()
    first = first_name(row.get("name"))
    greeting = f"Hello {first}," if first != "there" else "Hello,"
    audience = f"{niche} businesses" if niche and len(niche.split()) <= 3 else "local businesses"
    parts = [greeting, f"I came across your profile. {_compliment(row, niche)}"]
    obs = _observation(service, row)
    if obs:
        parts.append(obs)
    parts.append(f"I help {audience} with {offer}." if offer else f"I help {audience} grow online.")
    parts.append("Would you be open to a quick call this week?")
    return "\n\n".join(parts)


def message_for(template, row):
    """The person's own template when one is saved, otherwise the automatic message."""
    return render(template, row) if (template or "").strip() else auto_message(row)
