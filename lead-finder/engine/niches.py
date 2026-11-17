"""The niches Large Lead Finder can search, and the map tags that find them. Each niche is (id, label, group, tags).
A tag is "key=value" and matches places that carry it in OpenStreetMap, the open map of the world."""

RAW = """
food|restaurant|Restaurants|amenity=restaurant
food|cafe|Cafes and coffee shops|amenity=cafe
food|bakery|Bakeries|shop=bakery
food|fast-food|Fast food|amenity=fast_food
food|bar|Bars and pubs|amenity=bar,amenity=pub
food|caterer|Caterers|craft=caterer
food|ice-cream|Ice cream shops|amenity=ice_cream
food|butcher|Butchers|shop=butcher
food|greengrocer|Fruit and vegetable shops|shop=greengrocer
food|supermarket|Supermarkets and grocers|shop=supermarket,shop=convenience
food|confectionery|Sweets and chocolate|shop=confectionery,shop=chocolate
food|seafood|Fish and seafood|shop=seafood
food|wine|Wine and drinks shops|shop=wine,shop=alcohol,shop=beverages
beauty|hairdresser|Hair salons and barbers|shop=hairdresser
beauty|beauty-salon|Beauty salons|shop=beauty
beauty|nails|Nail salons|shop=beauty,beauty=nails
beauty|spa|Spas and massage|leisure=spa,shop=massage
beauty|tattoo|Tattoo studios|shop=tattoo
beauty|cosmetics|Cosmetics and perfume|shop=cosmetics,shop=perfumery
health|dentist|Dentists|amenity=dentist
health|doctor|Doctors and clinics|amenity=doctors,amenity=clinic
health|pharmacy|Pharmacies|amenity=pharmacy
health|optician|Opticians|shop=optician
health|veterinary|Veterinarians|amenity=veterinary
health|physio|Physiotherapists|healthcare=physiotherapist
health|alt-medicine|Alternative medicine|healthcare=alternative
health|hospital|Hospitals|amenity=hospital
health|psychologist|Psychologists and counselling|healthcare=psychotherapist,office=therapist
fitness|gym|Gyms and fitness centres|leisure=fitness_centre
fitness|yoga|Yoga studios|sport=yoga
fitness|martial-arts|Martial arts and boxing|sport=boxing,sport=karate,sport=judo,sport=taekwondo
fitness|dance|Dance schools|amenity=dancing_school
fitness|swimming|Swimming pools and schools|leisure=swimming_pool,sport=swimming
fitness|sports-club|Sports clubs|leisure=sports_centre
shops|clothes|Clothing shops|shop=clothes
shops|shoes|Shoe shops|shop=shoes
shops|jewelry|Jewellers|shop=jewelry
shops|bags|Bags and leather|shop=bag,shop=leather
shops|furniture|Furniture shops|shop=furniture
shops|electronics|Electronics shops|shop=electronics
shops|phones|Mobile phone shops|shop=mobile_phone
shops|computers|Computer shops|shop=computer
shops|florist|Florists|shop=florist
shops|gifts|Gift shops|shop=gift
shops|books|Bookshops|shop=books
shops|toys|Toy shops|shop=toys
shops|sports-shop|Sports shops|shop=sports
shops|bicycle|Bicycle shops|shop=bicycle
shops|hardware|Hardware and building supplies|shop=hardware,shop=doityourself,shop=trade
shops|pets|Pet shops|shop=pet
shops|art|Art shops and galleries|shop=art,tourism=gallery
shops|photo-shop|Photo shops|shop=photo
shops|stationery|Stationery and printing|shop=stationery,shop=copyshop
shops|fabric|Fabric and sewing|shop=fabric,shop=sewing
shops|interior|Interior design and decor|shop=interior_decoration,shop=houseware,shop=kitchen
shops|lighting|Lighting shops|shop=lighting
shops|baby|Baby and kids shops|shop=baby_goods,shop=children
shops|second-hand|Second hand shops|shop=second_hand
shops|variety|Department and variety stores|shop=department_store,shop=variety_store
auto|car-dealer|Car dealers|shop=car
auto|car-repair|Car repair garages|shop=car_repair
auto|car-parts|Car parts|shop=car_parts
auto|tyres|Tyre shops|shop=tyres
auto|car-wash|Car washes|amenity=car_wash
auto|car-rental|Car rental|amenity=car_rental
auto|motorcycle|Motorcycle shops|shop=motorcycle
auto|driving-school|Driving schools|amenity=driving_school
trades|electrician|Electricians|craft=electrician
trades|plumber|Plumbers|craft=plumber
trades|carpenter|Carpenters|craft=carpenter
trades|builder|Builders|craft=builder
trades|painter|Painters|craft=painter
trades|roofer|Roofers|craft=roofer
trades|hvac|Air conditioning and heating|craft=hvac
trades|gardener|Gardeners and landscaping|craft=gardener
trades|tailor|Tailors|craft=tailor
trades|shoemaker|Shoe repair|craft=shoemaker
trades|locksmith|Locksmiths|craft=locksmith
trades|cleaning|Cleaning services|shop=cleaning,craft=cleaning
trades|laundry|Laundry and dry cleaning|shop=laundry,shop=dry_cleaning
trades|metal-work|Welders and metal work|craft=metal_construction,craft=blacksmith
trades|glass|Glass and windows|craft=glaziery
trades|tiler|Tiling and flooring|craft=tiler,shop=flooring
professional|lawyer|Lawyers|office=lawyer
professional|accountant|Accountants|office=accountant
professional|estate-agent|Estate agents and realtors|office=estate_agent
professional|insurance|Insurance|office=insurance
professional|architect|Architects|office=architect
professional|notary|Notaries|office=notary
professional|consulting|Consultants|office=consulting
professional|employment|Recruitment agencies|office=employment_agency
professional|advertising|Marketing and advertising agencies|office=advertising_agency
professional|it-company|IT and software companies|office=it
professional|photographer|Photographers|craft=photographer,shop=photo_studio
professional|printing|Printers|craft=printer
professional|translator|Translators|office=translator
professional|financial|Financial services|office=financial,amenity=bureau_de_change
professional|coworking|Coworking spaces|amenity=coworking_space
professional|company|Other companies|office=company
professional|ngo|NGOs and charities|office=ngo,office=association
travel|hotel|Hotels|tourism=hotel
travel|guest-house|Guest houses and B and Bs|tourism=guest_house
travel|hostel|Hostels|tourism=hostel
travel|motel|Motels|tourism=motel
travel|apartments|Serviced apartments|tourism=apartment
travel|travel-agency|Travel agencies|shop=travel_agency
travel|tour-operator|Tour operators|office=tour_operator
travel|event-venue|Event venues and halls|amenity=events_venue,amenity=social_centre,leisure=resort
travel|wedding|Wedding services|shop=wedding
travel|nightclub|Nightclubs|amenity=nightclub
travel|cinema|Cinemas and theatres|amenity=cinema,amenity=theatre
education|school|Schools|amenity=school
education|kindergarten|Nurseries and kindergartens|amenity=kindergarten
education|language-school|Language schools|amenity=language_school
education|music-school|Music schools|amenity=music_school
education|college|Colleges and training centres|amenity=college,amenity=training
education|tutoring|Tutoring centres|office=educational_institution
education|university|Universities|amenity=university
community|church|Churches|amenity=place_of_worship
community|funeral|Funeral services|shop=funeral_directors
community|bank|Banks|amenity=bank
community|post-courier|Courier and shipping|office=courier,amenity=post_office
community|logistics|Logistics and moving|office=logistics,craft=mover
community|agriculture|Farms and agriculture|shop=agrarian,craft=agricultural_engines
community|solar|Solar and energy|craft=electronics_repair,shop=electrical
community|repair|Phone and electronics repair|craft=electronics_repair,shop=mobile_phone
"""


def _load():
    out = []
    for line in RAW.strip().splitlines():
        g, i, label, tags = line.split("|")
        out.append({"id": i, "label": label, "group": g, "tags": [t.strip() for t in tags.split(",") if t.strip()]})
    return out


NICHES = _load()
BY_ID = {n["id"]: n for n in NICHES}
GROUPS = {"food": "Food and drink", "beauty": "Beauty", "health": "Health", "fitness": "Fitness and sport", "shops": "Shops", "auto": "Cars and transport",
          "trades": "Trades and repair", "professional": "Professional services", "travel": "Travel, hotels and events", "education": "Education",
          "community": "Community and other"}


def catalog():
    return [{"id": n["id"], "label": n["label"], "group": GROUPS[n["group"]]} for n in NICHES]


def match_custom(text):
    """A niche typed by hand, such as 'tattoo' or 'wedding': the catalog niches whose name contains the word."""
    t = str(text or "").strip().lower()
    return [n for n in NICHES if t and (t in n["id"] or t in n["label"].lower())]
