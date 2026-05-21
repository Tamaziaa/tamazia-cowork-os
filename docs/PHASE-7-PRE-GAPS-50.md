# Phase 7 · Pre-execution 50-gap audit
**Authored before any build starts — scope-shaping list. Every gap must be either fixed in build or carried into the post-build 50-list.**

## Sourcing reliability (gaps 1-10)
1. API quota exhaustion mid-day → solution: cascade through 10 sources, dedupe, never burn one source's quota for what another can do
2. Companies House key not yet registered → workaround: HTML scrape of `find-and-update.company-information.service.gov.uk/search/companies?q=` (allowed, no key, paginated)
3. Hunter/Snov/Apollo keys not yet registered → workaround: email-pattern generator + SMTP RCPT probe via Node `net.Socket` to MX records
4. Google Places key not registered → workaround: OSM Overpass + Nominatim (free, no key, OSM-data-licence)
5. Yelp key not registered → workaround: OSM Overpass covers business POI; Yelp public listing scrape as last resort
6. SEC EDGAR has no key requirement but rate-limits at 10 req/s → respect with built-in throttle
7. OpenCorporates 500/mo free tier → ration to Tier-2 jurisdictions only (US, AU, NZ); UK uses Companies House first
8. Cross-source dedupe → composite key `lower(company_name)|domain|jurisdiction`
9. Source attribution audit trail → every lead row carries `source`, `source_query`, `imported_at`, `source_payload_hash`
10. NeverBounce subscription not provisioned → workaround: skip third-stage SMTP-paid verification, use pattern + open-MX probe as 2-stage

## Data quality (gaps 11-20)
11. Disposable/temporary email domains pollute → maintain `disposable_domains` deny-list
12. Generic role-based emails (info@, contact@, sales@) → de-prioritise, mark `generic_address=true`
13. International character handling in names (Müller, Patel, O'Brien) → normalise with `String.normalize('NFKD')`
14. UK vs US LinkedIn ID ambiguity → require `jurisdiction` match in finder
15. Instagram handle false positives (common nicknames) → require domain or display-name match
16. Sector taxonomy drift → use jurisdiction-router's canonical sector list as single source of truth
17. Lead duplication when same person at different companies → composite key includes `domain`
18. Stale leads (no engagement >180d) → mark `dormant=true`, skip outreach
19. Sourcing-time-of-day patterns (avoid sending all probes between 09-10 UTC) → cron stagger
20. Empty result handling — when a source returns nothing for a query, log + move on, don't retry infinitely

## Compliance + ethics (gaps 21-30)
21. GDPR-compliant sourcing → only public business records + LinkedIn/Apollo data licensed for B2B outreach
22. Article 14 GDPR transparency → privacy notice on tamazia.co.uk already references how data is collected
23. UK PECR opt-out routing → `dnc_reason` field already in schema (from Phase 4)
24. Suppression list — anyone who replied "unsubscribe" → automatic `dnc_reason='opt_out'`
25. Industry-specific exclusions (e.g. don't source healthcare leads from US states with HIPAA marketing risk) → sector × jurisdiction allow-list
26. UK ICO direct-marketing rules for sole traders → flag personal-data sole-trader records, route to soft outreach only
27. Robots.txt respect on every scraper → User-Agent identifies Tamazia, honour crawl-delay
28. Source ToS audit per integration → documented per source in `src/lib/sourcing/<source>.js` JSDoc
29. Email-finder ethics — never guess C-level personal emails for private companies → restrict to `domainSearch` patterns
30. SMTP probe ethics — never connect to mailboxes via password; only RCPT TO with immediate close → ToS-compliant verification

## Engineering robustness (gaps 31-40)
31. Cron failure recovery → all sourcing functions idempotent (rerun-safe)
32. Lead-write race conditions → `ON CONFLICT (domain, company)` upsert clause
33. Schema migration safety → migrations apply forward-only, no destructive operations
34. Backwards-compatibility with existing `leads` rows from Phases 0-6 → new columns nullable
35. Source-payload archival → JSONB column to store raw API response for forensics
36. Cron observability → every run logs success/failure/count to `sourcing_runs` table
37. Slack digest deliverability → use existing `scripts/notify-slack.sh` proven in Phase 1
38. Dashboard artifact data refresh → use existing `mcp__cowork__create_artifact` mechanism
39. LLM cost containment → no LLM use in sourcing engine; pattern-based only
40. Network resilience → all fetches wrapped in `fetchWithRetry` (already in `src/skills/S008-personalisation-engine/lib/http.js`)

## Coverage gaps (41-50)
41. Sector coverage: 10 sectors min (law / healthcare / fintech / insurance / real-estate / hospitality / pharma / ecommerce / charity / education)
42. Jurisdiction coverage: 5 min (UK / US / EU / UAE / Singapore)
43. Volume target: 100 verified/day = 30,000/year
44. LinkedIn finder coverage: ≥80% hit rate on UK + US, ≥60% on EU/UAE
45. Instagram finder coverage: ≥40% (B2C-skewed, lower target)
46. Email finder coverage: ≥75% pattern-match success across all jurisdictions
47. NeverBounce-verified coverage: ≥60% of sourced emails pass SMTP probe
48. Cowork artifact: KPIs visible at-a-glance (sourced/24h, verified/24h, by-sector, by-jurisdiction, ad-intel attached)
49. Slack digest format: morning brief with top 5 leads + sector mix + alerts
50. Audit-Worker integration: every sourced lead auto-routed to S008 personalisation engine within 6 hours

---
**Build approach:** Every gap above either fixed in the Phase 7 build OR explicitly flagged + carried into Post-50 list.
