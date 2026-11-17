"""Where businesses come from. Two open map services, used politely and not hammered: OpenStreetMap through the Overpass service
(every shop, office, clinic and workshop that people have mapped, with the phone, website and email they entered) and the
Nominatim place search (a second view of the same map that finds places the first one files differently).
Both answer questions in the open. Neither needs a login or a key."""
import re
import time

import requests

UA = "LargeLeadFinder/1.0 (business lead research; contact via evansademilua.vercel.app)"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
NOMINATIM = "https://nominatim.openstreetmap.org/search"
_last_nominatim = [0.0]


def _get(url, params, timeout=40):
    return requests.get(url, params=params, headers={"User-Agent": UA}, timeout=timeout)


def geocode(place):
    """One place name to an OpenStreetMap area. Returns dict(name, country, country_code, area_id, bbox) or None."""
    wait = 1.1 - (time.time() - _last_nominatim[0])
    if wait > 0:
        time.sleep(wait)
    _last_nominatim[0] = time.time()
    r = _get(NOMINATIM, {"q": place, "format": "jsonv2", "limit": 5, "addressdetails": 1, "accept-language": "en"})
    r.raise_for_status()
    best = None
    for it in r.json():
        if it.get("osm_type") == "relation":
            best = it
            break
    best = best or (r.json() or [None])[0]
    if not best:
        return None
    addr = best.get("address") or {}
    area = int(best["osm_id"]) + 3600000000 if best.get("osm_type") == "relation" else None
    bb = [float(x) for x in best.get("boundingbox", [])] or None
    return {"name": best.get("display_name", place).split(",")[0], "country": addr.get("country", ""), "country_code": (addr.get("country_code") or "").upper(),
            "area_id": area, "bbox": bb, "query": place}


def overpass_query(tags, area_id=None, bbox=None, limit=400):
    """The question put to Overpass: every place carrying one of the tags, inside the area, with its details."""
    where = "(area.a)" if area_id else "(%s,%s,%s,%s)" % (bbox[0], bbox[2], bbox[1], bbox[3])
    parts = []
    for t in tags:
        k, v = t.split("=", 1)
        parts.append('nwr["%s"="%s"]%s;' % (k, v, where))
    head = "[out:json][timeout:120];" + ("area(%d)->.a;" % area_id if area_id else "")
    return head + "(" + "".join(parts) + ");out tags center %d;" % limit


def overpass(tags, geo, limit=400):
    # a box around the place is far lighter for the shared map service than the exact outline of the place, so it is used when we have one
    q = overpass_query(tags, None if geo.get("bbox") else geo.get("area_id"), geo.get("bbox"), limit)
    last = None
    for url in OVERPASS:
        for attempt in range(2):
            try:
                r = requests.post(url, data={"data": q}, headers={"User-Agent": UA}, timeout=150)
                if r.status_code in (429, 504):
                    time.sleep(6 * (attempt + 1))
                    continue
                r.raise_for_status()
                return [parse_osm(e) for e in r.json().get("elements", []) if (e.get("tags") or {}).get("name")]
            except Exception as e:  # noqa
                last = e
    raise RuntimeError("The map service did not answer: %s" % str(last)[:100])


def parse_osm(el):
    t = el.get("tags") or {}
    g = lambda *keys: next((str(t[k]).strip() for k in keys if t.get(k)), "")
    street = " ".join(x for x in (g("addr:housenumber"), g("addr:street")) if x)
    return {"name": g("name"), "phone": g("phone", "contact:phone", "contact:mobile", "mobile"), "email": g("email", "contact:email"),
            "website": g("website", "contact:website", "url"), "instagram": g("contact:instagram", "instagram"), "facebook": g("contact:facebook", "facebook"),
            "address": ", ".join(x for x in (street, g("addr:suburb"), g("addr:city"), g("addr:postcode")) if x), "city": g("addr:city", "addr:town", "addr:village"),
            "source": "OpenStreetMap", "osm": "%s/%s" % (el.get("type", "node"), el.get("id"))}


def nominatim_places(term, place, limit=40):
    """The same map, searched by words: 'bakery in Lagos'. Gives details such as website and email when they are mapped."""
    wait = 1.1 - (time.time() - _last_nominatim[0])
    if wait > 0:
        time.sleep(wait)
    _last_nominatim[0] = time.time()
    r = _get(NOMINATIM, {"q": "%s in %s" % (term, place), "format": "jsonv2", "limit": limit, "extratags": 1, "addressdetails": 1, "namedetails": 1, "accept-language": "en"})
    r.raise_for_status()
    out = []
    for it in r.json():
        x = it.get("extratags") or {}
        name = (it.get("namedetails") or {}).get("name") or it.get("name") or ""
        if not name:
            continue
        a = it.get("address") or {}
        out.append({"name": name, "phone": x.get("phone") or x.get("contact:phone") or "", "email": x.get("email") or x.get("contact:email") or "",
                    "website": x.get("website") or x.get("contact:website") or x.get("url") or "", "instagram": x.get("contact:instagram") or x.get("instagram") or "",
                    "facebook": x.get("contact:facebook") or x.get("facebook") or "",
                    "address": (it.get("display_name") or "")[:140], "city": a.get("city") or a.get("town") or a.get("village") or "", "source": "OpenStreetMap search",
                    "osm": "%s/%s" % (it.get("osm_type"), it.get("osm_id"))})
    return out


def clean_url(u):
    u = (u or "").strip()
    if not u:
        return ""
    if not re.match(r"^https?://", u, re.I):
        u = "http://" + u
    return u
