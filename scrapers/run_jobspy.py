#!/usr/bin/env python3
"""Tamazia hiring-signal scraper — robust, multi-board, rotating coverage.

Boards (via JobSpy): indeed, google, linkedin, glassdoor, zip_recruiter, bayt (Gulf). A firm hiring for an
SEO/marketing/compliance/growth role has budget + a capability gap Tamazia fills. Covers every served region
(UK/US/UAE/EU) and its cities + roles; DAILY ROTATION keeps each run bounded + LinkedIn rate-limit-safe while
covering the full matrix over a week. Every scrape is independently try/except'd (one board never breaks the run).
Prints JSON {rows:[{company,title,location,country,query,site}], count, attempted, errors}."""
import sys, json, os, datetime
sys.path.insert(0, '/tmp/pylib')
try:
    from jobspy import scrape_jobs
except Exception as e:
    print(json.dumps({"error": "jobspy_not_installed: " + str(e), "rows": [], "count": 0})); sys.exit(0)

# Served roles (cross-sector buyer signals) + regions->cities + boards per region.
ROLES = ["SEO manager", "digital marketing manager", "marketing manager", "compliance officer",
         "head of growth", "head of marketing", "paid media manager", "content marketing manager"]
REGIONS = {
    "UK":  {"cities": ["London, UK", "Manchester, UK", "Birmingham, UK", "Leeds, UK", "Edinburgh, UK", "Bristol, UK"], "indeed_country": "UK",  "boards": ["indeed", "google", "linkedin", "glassdoor"]},
    "USA": {"cities": ["New York, NY", "Los Angeles, CA", "Chicago, IL", "Miami, FL", "Austin, TX"],                   "indeed_country": "USA", "boards": ["indeed", "google", "linkedin", "zip_recruiter", "glassdoor"]},
    "UAE": {"cities": ["Dubai, UAE", "Abu Dhabi, UAE"],                                                               "indeed_country": "UAE", "boards": ["bayt", "indeed", "google", "linkedin"]},
    "EU":  {"cities": ["Dublin, Ireland", "Paris, France", "Berlin, Germany", "Amsterdam, Netherlands", "Madrid, Spain"], "indeed_country": "Ireland", "boards": ["indeed", "google", "linkedin"]},
}
PER = int(os.environ.get("JOBSPY_PER", "6"))
# Allow full override from the caller (JSON arg).
try:
    if len(sys.argv) > 1 and sys.argv[1].strip().startswith("{"):
        cfg = json.loads(sys.argv[1])
        ROLES = cfg.get("roles", ROLES)
        if cfg.get("regions"): REGIONS = cfg["regions"]
except Exception:
    pass

# DAILY ROTATION: build the full (region, city, board) matrix, then take a rotating window by day-of-year so
# each run is bounded (~10-14 scrapes) and the whole matrix is covered across the week. LinkedIn kept small.
matrix = []
for region, meta in REGIONS.items():
    for city in meta["cities"]:
        for board in meta["boards"]:
            matrix.append((region, city, board, meta["indeed_country"]))
doy = datetime.date.today().timetuple().tm_yday
WINDOW = int(os.environ.get("JOBSPY_WINDOW", "12"))
start = (doy * WINDOW) % max(1, len(matrix))
combos = [matrix[(start + i) % len(matrix)] for i in range(min(WINDOW, len(matrix)))]
# rotate roles too (3 per run)
role_start = (doy * 3) % max(1, len(ROLES))
roles_today = [ROLES[(role_start + i) % len(ROLES)] for i in range(min(3, len(ROLES)))]

seen = set(); out = []; errors = []; attempted = 0
for (region, city, board, icountry) in combos:
    for role in roles_today:
        attempted += 1
        try:
            kw = {"site_name": [board], "search_term": role, "location": city, "results_wanted": (3 if board == "linkedin" else PER), "hours_old": 1000}
            if board == "indeed": kw["country_indeed"] = icountry
            if board == "linkedin": kw["linkedin_fetch_description"] = False
            df = scrape_jobs(**kw)
            for _, r in df.iterrows():
                comp = str(r.get('company', '') or '').strip()
                if not comp or comp.lower() == 'nan': continue
                key = comp.lower()
                if key in seen: continue
                seen.add(key)
                out.append({"company": comp, "title": str(r.get('title', '') or '')[:80], "location": city, "country": region, "query": role, "site": board})
        except Exception as e:
            errors.append("%s/%s/%s: %s" % (board, city, role, str(e)[:80]))
print(json.dumps({"rows": out, "count": len(out), "attempted": attempted, "errors": errors[:8]}))
