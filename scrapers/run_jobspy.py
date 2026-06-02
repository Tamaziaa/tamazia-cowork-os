#!/usr/bin/env python3
"""Tamazia hiring-signal scraper. Runs JobSpy for ICP-relevant roles (a firm hiring for SEO/marketing/compliance
has budget + a gap Tamazia fills) and prints JSON [{company, title, location, country, query}]. No rate-limit
on Indeed/Google. Domain resolution + ICP gating happen downstream in the JS adapter + icp.js."""
import sys, json, os
sys.path.insert(0, '/tmp/pylib')
try:
    from jobspy import scrape_jobs
except Exception as e:
    print(json.dumps({"error": "jobspy_not_installed: " + str(e), "rows": []})); sys.exit(0)

# ICP buyer-signal roles + served locations (UK/UAE/US). Override via argv JSON if given.
ROLES = ["SEO manager", "digital marketing manager", "marketing manager", "compliance officer", "head of growth"]
LOCS = [("London, UK", "UK"), ("Dubai, UAE", "UAE"), ("New York, NY", "USA")]
try:
    if len(sys.argv) > 1:
        cfg = json.loads(sys.argv[1]); ROLES = cfg.get("roles", ROLES); LOCS = [tuple(x) for x in cfg.get("locs", LOCS)]
except Exception:
    pass
PER = int(os.environ.get("JOBSPY_PER", "6"))

seen = set(); out = []
for role in ROLES:
    for loc, country in LOCS:
        try:
            ci = 'UK' if country == 'UK' else ('USA' if country == 'USA' else 'UK')
            df = scrape_jobs(site_name=['indeed'], search_term=role, location=loc, results_wanted=PER, country_indeed=ci, hours_old=720)
            for _, r in df.iterrows():
                comp = str(r.get('company', '') or '').strip()
                if not comp or comp.lower() == 'nan': continue
                key = comp.lower()
                if key in seen: continue
                seen.add(key)
                out.append({"company": comp, "title": str(r.get('title', '') or '')[:80], "location": loc, "country": country, "query": role})
        except Exception as e:
            sys.stderr.write("jobspy error %s/%s: %s\n" % (role, loc, e))
print(json.dumps({"rows": out, "count": len(out)}))
