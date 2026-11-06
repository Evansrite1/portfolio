"""Country data: phone codes, domain endings, flags and cities used to place a business in a country.

A country is only reported when a real signal points to it. Nothing here guesses from the name of the person.
"""

COUNTRIES = {
    "USA": {
        "phone": ["+1"], "tld": [".us"], "flag": "\U0001F1FA\U0001F1F8",
        "words": ["usa", "united states", "u.s.a"],
        "cities": ["atlanta", "dallas", "houston", "austin", "miami", "orlando", "tampa", "new york", "nyc", "brooklyn",
                   "los angeles", "la", "san diego", "san francisco", "seattle", "portland", "chicago", "detroit",
                   "new orleans", "nashville", "charlotte", "phoenix", "las vegas", "denver", "boston", "philadelphia",
                   "baltimore", "washington dc", "minneapolis", "columbus", "indianapolis", "kansas city", "san antonio",
                   "tx", "ca", "fl", "ny", "ga", "il", "mi", "la,", "nc", "az", "nv", "co", "wa", "oh", "tn", "pa"],
        "search_cities": ["Atlanta", "Dallas", "Houston", "Austin", "Miami", "Orlando", "Chicago", "Detroit", "New Orleans",
                          "Nashville", "Charlotte", "Phoenix", "Las Vegas", "Denver", "Los Angeles", "San Diego", "Seattle"],
    },
    "UAE": {
        "phone": ["+971"], "tld": [".ae"], "flag": "\U0001F1E6\U0001F1EA",
        "words": ["uae", "united arab emirates"],
        "cities": ["dubai", "abu dhabi", "sharjah", "ajman", "ras al khaimah", "fujairah", "al ain", "jbr", "marina", "downtown dubai"],
        "search_cities": ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Al Ain"],
    },
    "Kuwait": {
        "phone": ["+965"], "tld": [".kw", ".com.kw"], "flag": "\U0001F1F0\U0001F1FC",
        "words": ["kuwait", "q8"],
        "cities": ["kuwait city", "hawally", "salmiya", "farwaniya", "jahra", "ahmadi", "mangaf", "fahaheel", "kuwait"],
        "search_cities": ["Kuwait City", "Salmiya", "Hawally", "Jahra", "Farwaniya"],
    },
    "UK": {
        "phone": ["+44"], "tld": [".uk", ".co.uk"], "flag": "\U0001F1EC\U0001F1E7",
        "words": ["united kingdom", "england", "scotland", "wales", "uk"],
        "cities": ["london", "manchester", "birmingham", "leeds", "liverpool", "glasgow", "bristol", "edinburgh", "sheffield"],
        "search_cities": ["London", "Manchester", "Birmingham", "Leeds", "Liverpool", "Glasgow"],
    },
    "Canada": {
        "phone": [], "tld": [".ca"], "flag": "\U0001F1E8\U0001F1E6",
        "words": ["canada"],
        "cities": ["toronto", "vancouver", "montreal", "calgary", "ottawa", "edmonton", "mississauga", "winnipeg"],
        "search_cities": ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa"],
    },
    "Australia": {
        "phone": ["+61"], "tld": [".au", ".com.au"], "flag": "\U0001F1E6\U0001F1FA",
        "words": ["australia"],
        "cities": ["sydney", "melbourne", "brisbane", "perth", "adelaide", "gold coast", "canberra"],
        "search_cities": ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
    },
    "Nigeria": {
        "phone": ["+234"], "tld": [".ng", ".com.ng"], "flag": "\U0001F1F3\U0001F1EC",
        "words": ["nigeria"],
        "cities": ["lagos", "abuja", "port harcourt", "ibadan", "kano", "enugu", "benin city"],
        "search_cities": ["Lagos", "Abuja", "Port Harcourt", "Ibadan"],
    },
    "Saudi Arabia": {
        "phone": ["+966"], "tld": [".sa"], "flag": "\U0001F1F8\U0001F1E6",
        "words": ["saudi", "ksa"],
        "cities": ["riyadh", "jeddah", "dammam", "mecca", "medina", "khobar"],
        "search_cities": ["Riyadh", "Jeddah", "Dammam", "Khobar"],
    },
    "Qatar": {
        "phone": ["+974"], "tld": [".qa"], "flag": "\U0001F1F6\U0001F1E6",
        "words": ["qatar"],
        "cities": ["doha", "al wakrah", "lusail"],
        "search_cities": ["Doha", "Lusail"],
    },
    "South Africa": {
        "phone": ["+27"], "tld": [".za", ".co.za"], "flag": "\U0001F1FF\U0001F1E6",
        "words": ["south africa"],
        "cities": ["johannesburg", "cape town", "durban", "pretoria"],
        "search_cities": ["Johannesburg", "Cape Town", "Durban", "Pretoria"],
    },
}

# What to search when the person gives no keywords. Local service businesses that sell by showing their work.
DEFAULT_NICHES = [
    "tattoo artist", "barber", "hair salon", "makeup artist", "nail technician", "lash artist", "photographer",
    "personal trainer", "fitness coach", "yoga studio", "bakery", "custom cakes", "florist", "boutique",
    "interior designer", "car detailing", "cleaning service", "event planner", "caterer", "massage therapist",
]

# Pages that only link out to other places. They are not the business's own website.
LINK_HUBS = ["linktr.ee", "linktree.com", "beacons.ai", "bio.link", "linkin.bio", "lnk.bio", "solo.to", "campsite.bio",
             "taplink.cc", "tap.bio", "linkpop.com", "stan.store", "carrd.co", "msha.ke", "withkoji.com", "later.com",
             "flow.page", "link.bio", "allmylinks.com", "hoo.be", "direct.me", "linktw.in", "shor.by", "bio.site", "snipfeed.co"]

# Social, booking and messaging pages. Not a website the business owns.
NOT_A_SITE = ["instagram.com", "facebook.com", "fb.com", "fb.me", "tiktok.com", "youtube.com", "youtu.be", "twitter.com",
              "x.com", "wa.me", "whatsapp.com", "api.whatsapp.com", "t.me", "snapchat.com", "pinterest.com", "linkedin.com",
              "threads.net", "booksy.com", "vagaro.com", "fresha.com", "styleseat.com", "squareup.com", "square.site",
              "calendly.com", "acuityscheduling.com", "setmore.com", "cash.app", "venmo.com", "paypal.me", "paypal.com",
              "patreon.com", "spotify.com", "apple.com", "google.com", "goo.gl", "maps.app.goo.gl", "g.page", "yelp.com",
              "ubereats.com", "doordash.com", "zalando.com", "amazon.com", "etsy.com", "ebay.com", "depop.com", "poshmark.com",
              "zenoti.com", "mindbodyonline.com", "classpass.com", "tiktokshop.com", "shopee.com", "talabat.com", "zomato.com",
              "deliveroo.ae", "carriage.com", "noon.com", "getsquire.com", "jotform.com", "forms.gle", "typeform.com", "glossgenius.com",
              "schedulicity.com", "thecut.co", "trafft.com", "appointy.com", "vcita.com", "booksy.net", "mangomint.com", "tiktok.com", "wa.link", "bit.ly", "tinyurl.com", "linktr.ee"]


def country_names():
    return list(COUNTRIES.keys())
