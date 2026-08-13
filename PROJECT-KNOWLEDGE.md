# Tamazia · Project Knowledge (locked rules)

Last updated: 2026-05-26 · Authority: Aman Pareek, founder

Single source of truth for the audit page, scraper, email engine and any other Tamazia-facing output. Anything in this file overrides earlier docs.

## Identity separation — never mix

Tamazia and LexQuity are two different companies under one founder.

- **Tamazia (this codebase):** sole founder Aman Pareek. No co-founders. No "senior advisors" mentioned in any client-facing artefact.
- **LexQuity (separate company):** Manuel Penadés (legal lead) · Danish (CLO) · Aditya (engineering). **Never** mention any of them on Tamazia outputs (audit pages, emails, decks, landing pages, scripts).

Rule for every code path that touches client-facing copy: if it references a person, that person must be Aman Pareek (founder) or a verified Tamazia client. Nothing else.

## Founder credentials — homepage founder-box only

The only credentials that appear in client-facing Tamazia outputs are those visible in the founder block on tamazia.co.uk. Do not pull from CV, LinkedIn, internal docs, or research agents. If a credential is not on the homepage today, it does not appear in client output today. Current homepage-derived line:

> Founder: Aman Pareek, LLM in International Business Law, King's College London.

Anything beyond that (CIArb membership, arbitral institution exposure, Article 27 UK Rep, etc.) is intentionally withheld from the audit until Aman adds it to the homepage.

## Metric attributions — canonical, never confused

| Metric | Owner | What it measures | Source / verification |
|---|---|---|---|
| 882% peak client revenue growth | Oxford Gold Resort (hospitality) | Year-on-year revenue | GA4 verified, client under NDA |
| 840% organic users growth (6 months) | Orchid Hotels (hospitality, APAC) | GA4 organic users | GA4 verified |
| 113% revenue growth YoY | Orchid Hotels | YoY revenue | GA4 verified |
| 83% direct bookings uplift | Orchid Hotels | OTA → direct shift | Internal booking system, cross-referenced |
| 96% IPO share price increase | CG Oncology (Nasdaq, CGON) | Listing-day share price | Posed as **one factor** in the listing, never as the sole driver |
| Zero compliance incidents | Meraas (Dubai Holding subsidiary, UAE) | RERA + Trakheesi published-content compliance | Verified |
| £110M+ generated for clients | Aggregate | Tamazia-wide aggregate | All client work combined |

Hard rules:
- 882% and 840% are different facts (revenue vs users, different clients). Never collapse.
- 96% CGON is "the brand was clean and visible through the listing window" — framed as a contributing factor, not a claim of causation.
- All currency in £ everywhere (not $).

## Frivolous-claim ban

No statistic appears on a client-facing surface unless one of:
1. Tamazia's own measured client outcome (table above), or
2. A regulator's published enforcement figure, with the regulator named inline in small text (e.g., "Source: ICO 2024 enforcement record"), or
3. A peer-reviewed industry study, with the source named inline.

Strip any "XX% of UK firms breach Y" line that does not pass this test (the 64% SRA Rule 8.9 line is removed).

## Sectors served

Twelve sectors with their own framework sets. Default sector for unspecified leads = `professional-services`.

1. Legal (law firms, barristers, mediators, arbitration practices)
2. Healthcare (clinics, hospitals, dental, pharma, aesthetic, GLP-1)
3. Real estate (residential, commercial, BTR, PBSA, estate agents, developers)
4. Hospitality (hotels, resorts, restaurants, F&B groups)
5. Finance (banking, fintech, payments, wealth)
6. Insurance
7. E-commerce / Retail
8. Tech / SaaS
9. Education (higher ed, schools, training providers)
10. Charity / Non-profit
11. Energy / Utilities
12. Media / Marketing

## Countries supported

Audit framework matrix covers UK · EU (all member states) · USA (federal + state) · UAE (federal + DIFC + ADGM) · Saudi Arabia · Singapore · India · Hong Kong.

Scraper auto-detects the client's operating countries from TLD, currency, phone codes, language tags, addresses, regulator references. Only applicable countries' laws are evaluated against the client's site.

## Evidence-only rule (audit page)

Every finding must be evidence-tied to the actual scraped page. A critical badge is permitted only when a missing element / present non-compliant element was observed and is quoted in the verbatim block. No abstract law citations without site evidence.
