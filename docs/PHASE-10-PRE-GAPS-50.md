# Phase 10 · Pre-execution 50-gap audit

## 500-title catalogue (1-10)
1. Sector titles distributed unevenly — legal/healthcare have more sub-sectors than charity/education → weight scoring per sector
2. Title scoring axes: commercial intent · regulatory complexity · Tamazia delivery fit · competitive density
3. Score range 1-10 per axis × 4 axes = composite 4-40
4. Top 100 titles per sector cluster get keyword pipeline priority
5. Title → SIC/NAICS code mapping for SEC EDGAR + OpenCorporates queries
6. Title → OSM tag mapping for geo-sourcing
7. Title catalogue is a CSV/JSON file (no DB explosion)
8. Title catalogue refresh — quarterly review with sector experts
9. LexQuity arbitration titles separate (institutional, not commercial)
10. International title localisation — same title, different keywords per jurisdiction

## City × jurisdiction matrix (11-20)
11. 200 cities × 5 jurisdictions = 1000 cells; not every cell is viable
12. Top 50 cells contribute 80% of expected lead volume
13. Each cell: top-3 sectors, top-3 regulators, market-size signal, sector-pitch variant
14. Cell prioritisation by GDP + Tamazia delivery fit
15. UK heavy weighting on London + Manchester + Edinburgh + Birmingham + Bristol
16. US heavy weighting on NY + SF + LA + Chicago + Boston + Miami
17. EU: Paris + Berlin + Munich + Amsterdam + Madrid + Milan + Dublin
18. UAE: Dubai + Abu Dhabi
19. Singapore: single cell
20. Matrix stored as JSON; UI rendered via dashboard

## 20-sector × 50-source intelligence base (21-30)
21. 20 sectors covered: law-firms, barristers, accounting, professional-services, healthcare, dental, pharma, finance, fintech, insurance, real-estate, hospitality, ecommerce, retail, education, higher-education, charity, energy, transport, manufacturing
22. 50 sources per sector = 1000 source URLs to monitor
23. Sources: regulators, trade press, industry analysts, conferences, networking bodies
24. Source freshness — RSS where available, HTML scrape otherwise
25. Source attribution — every news item carries source URL + timestamp
26. LLM-free monitoring — keyword match + change detection only
27. Daily ingest budget: 50 sources × 20 sectors = 1000 requests; throttle 1 req/s = 17 min
28. Industry news ingester (S053) does the heavy lifting
29. Regulator watch (S036) is the high-priority subset
30. Company news monitor (S034) does per-lead news

## Site change + brand mention + review monitors (31-40)
31. S035 site change detector: per-lead website diff weekly → ping when content shifts
32. S054 brand mention monitor: Tamazia + LexQuity + Aman + Manuel mentions across web + social
33. S055 review monitor: Tamazia client reviews on Google + Trustpilot + sector-specific platforms
34. Diff signal types: content changed, page added, page removed, pricing changed
35. Content change confidence — low for blog post changes, high for legal/pricing page changes
36. Brand mention search engines: Google + Bing + DDG (free, no key needed via DDG HTML scrape)
37. Review platform coverage: Google Business, Trustpilot, Glassdoor, sector-specific
38. Sentiment tagging — keyword match (positive/negative wordlist) rather than LLM for cost
39. Alert threshold — only ping Slack on negative + new + significant
40. Frequency: site change weekly, brand mention daily, review daily

## Sector trend impact tagging + International + LexQuity (41-50)
41. Sector trend impact: cross-reference regulator news + ad-intel + leads in that sector
42. A "heat" signal per sector-jurisdiction cell (low/medium/high/critical)
43. Heat signal updates lead priority_score
44. Tamazia international brief — separate document per region (UK/EU/USA/ME)
45. International brief format: top 5 competitors, top 10 regulator focus, top 20 sector × jurisdiction pairs, regional pricing, local case-study patterns
46. International brief feeds website copy + audit Worker + cold-email templates + LinkedIn drafter + spoken positioning
47. LexQuity market map — top 10 institutions, top 50 arbitrators, top 100 firms, competitor tools
48. LexQuity pricing benchmarks per jurisdiction (UK Big Law vs UAE arbitration practitioners vs US AmLaw)
49. LexQuity competitor monitor: Disco / Relativity / Kira / RAVN / Jus Mundi LinkedIn + website + news
50. End-state deliverable: every lead arrives in outreach with sector heat + regional context + competitor positioning + LexQuity overlay attached

---
**Build approach:** static catalogues (title + city × jurisdiction + sector × source) → monitoring skills (S034-S055) → tagging pipeline → 2 strategic docs (Tamazia international brief + LexQuity market map) → live verification → post-50 + closeout
