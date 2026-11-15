"""What the person offers, and which businesses are a good lead for it.

A service says two things: which businesses to keep (the rule), and what a first message can honestly say about them.
Every rule uses facts the app can read from the profile (links, post dates, bio). Nothing is guessed from pictures.
"""

BOOKING_WORDS = ("booksy", "vagaro", "fresha", "styleseat", "square.site", "squareup", "calendly", "squire", "as.me",
                 "acuity", "setmore", "glossgenius", "schedulicity", "booking", "book.", "reserve", "opentable", "resy",
                 "ubereats", "doordash", "grubhub", "order.", "menu.", "toasttab", "wa.me", "whatsapp")

SERVICES = {
    "website": dict(
        label="Website design", offer="website design",
        blurb="Businesses with no website of their own. Their profile links to nothing, or only to a link page.",
        website="no", quiet_ok=False,
        example=("Hello {first_name},\n\nI came across your {niche} page and like what you are building.\n\n"
                 "I noticed your profile does not link to a website. I build websites for {niche} businesses, so clients "
                 "can see your work and get in touch from one place.\n\nWould you be open to a quick call this week?")),
    "redesign": dict(
        label="Website redesign", offer="website redesign",
        blurb="Businesses that already have a website. You offer to improve it.",
        website="yes", quiet_ok=False,
        example=("Hello {first_name},\n\nI came across your {niche} page and had a look at your website, {website}.\n\n"
                 "I help {niche} businesses refresh their websites so more visitors turn into clients.\n\n"
                 "Would you be open to a quick call this week?")),
    "social": dict(
        label="Social media management", offer="social media management",
        blurb="Businesses that post rarely or have gone quiet. You offer to run their page.",
        website="either", quiet_ok=True,
        example=("Hello {first_name},\n\nI came across your {niche} page. Your work deserves to be seen more often.\n\n"
                 "I noticed the page has not been posting much lately. I manage Instagram for {niche} businesses, "
                 "so posts go out steadily without taking your time.\n\nWould you be open to a quick call this week?")),
    "booking": dict(
        label="Online booking or ordering", offer="online booking and ordering",
        blurb="Businesses whose profile has no booking or ordering link. You offer to set one up.",
        website="either", quiet_ok=False,
        example=("Hello {first_name},\n\nI came across your {niche} page and like what you are building.\n\n"
                 "I could not find a booking or ordering link on your profile. I set up simple online booking for "
                 "{niche} businesses, so clients can book without sending messages back and forth.\n\n"
                 "Would you be open to a quick call this week?")),
    "any": dict(
        label="Any business", offer="",
        blurb="No service filter. Every business that matches the audience you choose.",
        website="either", quiet_ok=False,
        example=("Hello {first_name},\n\nI came across your {niche} page and like what you are building.\n\n"
                 "I help {niche} businesses grow online, and I would love to hear what you are working on.\n\n"
                 "Would you be open to a quick call this week?")),
}

DEFAULT_SERVICE = "website"


def get(key):
    return SERVICES.get(key) or SERVICES[DEFAULT_SERVICE]


def listing():
    """What the screen needs to draw the service cards."""
    return [dict(key=k, label=v["label"], blurb=v["blurb"], offer=v["offer"], example=v["example"], quiet_ok=v["quiet_ok"])
            for k, v in SERVICES.items()]


def booking_seen(links, site):
    blob = " ".join(list(links or []) + [site.get("website", ""), site.get("website_detail", "")]).lower()
    return any(w in blob for w in BOOKING_WORDS)


def skip_reason(key, u, tr, site, links):
    """A short reason when this business is NOT a lead for the service, otherwise an empty string."""
    if key == "social":
        active = tr.get("active", "")
        try:
            ppm = float(tr.get("posts_per_month") or 0)
        except ValueError:
            ppm = 0
        if not tr.get("last_post"):
            return "no post history to judge"
        if active in ("Slow", "Inactive") or (ppm and ppm < 4):
            return ""
        return "already posts often"
    if key == "booking":
        return "already has a booking or ordering link" if booking_seen(links, site) else ""
    return ""
