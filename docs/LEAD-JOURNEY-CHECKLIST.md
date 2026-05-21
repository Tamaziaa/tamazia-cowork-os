# Lead journey · full checklist + Touch-0 framing per sector
How every lead moves through the engine, what's tracked at each step, and how Touch 0 is framed by sector. Demonstrated live on real ad-runners pulled from Google sponsored results.

## The full journey (every lead passes these gates — each is tracked in Postgres + the admin dashboard)

```
[1] SOURCED            lead_id, company, source, acquisition_channel, created_at      → lifecycle_stage='sourced'
[2] AD-INTENT CHECK    pixel-detector / job-board / Google-sponsored / Meta Ad Lib    → ad_intel, aggressive_source
[3] ENRICHED           website, contact_email, first/last name, title, linkedin,      → lifecycle_stage='enriched'
                       instagram, best_channel  (Hunter → web-scrape → social)
[4] CHANNEL DECIDED    email > linkedin > instagram                                    → best_channel
[5] VERIFIED           NeverBounce on email (bounce<2% gate)                            → contact_confidence
[6] RESEARCHED         S063 deep-research: site + news + sector-intel + brief          → personalisation_pointers
[7] AUDIT MINTED       audit.tamazia.co.uk/audit/<slug> generated + URL verified 200   → audit_url, audit_url_minted_at
[8] DRAFTED            Touch 0 personalised; linted (spam + placeholder gates)         → outreach_drafts (touch 0)
[9] SENT — Touch 0     email: aman@ via relay router (rotated/failover);               → sends / channel_sends, sent_at
                       linkedin/insta: queued for manual send (dashboard button)
[10] TOUCH 1 (+5d)     audit URL injected + verified (blocks if 404)                   → status='touch_1_queued'
[11] TOUCH 2 (+10d)    follow-up, same identity/thread                                 → status='touch_2_queued'
[12] TOUCH 3 (+20d)    final touch                                                     → status='touch_3_queued'
[13] REPLY             IMAP poll (founder@) classifies 14 categories → pauses cadence  → inbound_emails, replied=TRUE
[14] JOURNEY LOGGED    every event in client_journey view + admin dashboard            → lifecycle_stage updates
```

Manual-send channels (LinkedIn/Instagram): you press "Mark sent" in the dashboard → it logs the send and serves the next touch + its own button. Email channel: fully automatic + tracked.

## Live proof — ad-runner sourced from Google sponsored results
- Search "luxury hotel london book" → **Sponsored**: oetkerhotels.com (The Lanesborough), fourseasons.com → ingested to the aggressive-leads review window (aggressive_source=TRUE).
- Real Touch-0 generated for Four Seasons (grounded in their actual site):
  > Subject: *Four Seasons London: Enhancing Guest Trust*
  > "...In today's landscape, where consumer trust is paramount, ensuring all digital communications are not only engaging but also fully compliant is crucial... Tamazia, a lawyer-led firm... reviewing your digital outreach against over 200 laws. Would 20 minutes next week be useful? ..."
  > (Note: this draft contained an unresolved `[Decision Maker Name]` placeholder → the new placeholder guard BLOCKS it from sending until enrichment fills the name. No broken merge fields ever go out.)

## Touch-0 framing by sector (the angle the engine uses)
- **Hospitality** (hotels/restaurants/venues): guest-trust + ASA/CMA advertising-claims compliance + booking-funnel SEO. Hook: a specific tracking pixel or campaign you spotted.
- **Healthcare** (clinics/aesthetics): MHRA health-claims + ASA cosmetic-ad rules + CQC trust signals. Hook: regulatory exposure on treatment-claim content.
- **Real estate** (agencies/developers): property-marketing + consumer-protection (DMCC) + RERA (UAE). Hook: portal/ad spend vs compliance gap.
- **Law firms**: SRA advertising rules + data-protection (ICO). Hook: their own compliance credibility vs their digital footprint.
Every Touch 0 names 2-3 real specifics from the lead's site/news (not templated), signs as Aman Pareek (King's, founder), one ask → cal link.

## Honest status of the Google sponsored scraper
- **Works** when ads are present (proven on the hotel query). **Opportunistic, not 100%** — Google varies ad presence by query/region/time and obfuscates ad markup; the clinic query showed no ads in that moment.
- Robust ad-runner detection therefore = pixel-detector + job-board scanner + Meta Ad Library (built, reliable) + Google Ads Transparency Center, with SERP sponsored-scraping as a supplement.
- Reliability upgrade (flagged): a SERP API (ScrapingBee/SerpAPI free tier) gives consistent sponsored extraction vs fragile live Chrome scraping — one signup when you want it always-on.
