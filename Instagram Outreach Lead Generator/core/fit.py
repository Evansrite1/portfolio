"""Who is not worth a message. These businesses are left out of the results and counted under "Passed over".

The rules follow the leads sheet this app was built to match: job boards and recruiters, fashion, clothing and perfume
brands that sell online, hotel chains, and accounts with no clear business at all.
"""
import re

JOB_WORDS = ["hiring", "vacanc", "job opening", "jobs in", "job alert", "recruit", "careers", "apply now", "staffing", "job board"]
RETAIL_CATEGORY = ["clothing", "fashion", "apparel", "perfume", "fragrance", "shoe", "jewel", "handbag", "accessor",
                   "shopping", "retail", "e-commerce", "online store", "cosmetics", "beauty store", "makeup store", "brand"]
SHOP_SIGNALS = ["worldwide shipping", "shipping worldwide", "free shipping", "shop now", "shop online", "new arrivals",
                "online store", "order via whatsapp", "order on whatsapp", "we ship", "cash on delivery", "cod available",
                "shop the", "our collection", "collection out now"]


def skip_reason(u, site):
    """Returns a short reason when this account should not get a message, otherwise an empty string."""
    bio = (u.get("bio") or "").lower()
    cat = (u.get("category") or "").lower()
    name = (u.get("name") or "").lower()
    blob = f"{bio} {name} {cat}"
    if any(w in blob for w in JOB_WORDS):
        return "job board or recruiter"
    retail = any(w in cat for w in RETAIL_CATEGORY)
    shop = any(w in blob for w in SHOP_SIGNALS) or "shopify" in (site.get("platform") or "").lower()
    if retail and shop:
        return "clothing, fashion or product brand selling online"
    if re.search(r"hotel|resort", cat) and (u.get("followers") or 0) > 50000:
        return "hotel chain"
    if not bio.strip() and not cat and (u.get("post_count") or 0) < 5:
        return "unclear business, no service offer"
    return ""
