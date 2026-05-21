# Compliant acquisition engine · ad-runners → contacts → outreach

The goal — companies currently running ads, across our sectors, with decision-maker contacts ready to email — achieved on the compliant B2B path. No personal-social scraping (see the GDPR/PECR reasoning in chat).

## The flow
1. **Detect ad-runners** (built + verified live):
   - `pixel-detector.js` — Meta/Google/LinkedIn/TikTok pixel on a company site = they advertise.
   - `intent-job-boards.js` — hiring marketers (Greenhouse/Lever/Workable/Ashby) = active marketing budget. Live test: Stripe 478 roles / 41 marketing.
   - `meta-ad-library.js`, `google-ads-transparency.js`, `linkedin-ad-library.js`, `tiktok-creative-center.js` — pull active creative + advertiser by sector × region.
2. **Source the company universe** (built): GLEIF, Companies House UK, SEC EDGAR, OSM Overpass across hospitality / healthcare / real-estate, UK/UAE/EU/USA.
3. **Enrich to decision-makers (compliant)**: Apollo (`apollo_search_people` / `apollo_enrich_organization`) + Hunter for verified, role-based corporate addresses. Apollo/Hunter carry the lawful basis; we take role-holders (Head of Marketing, CMO, Founder), not harvested personal inboxes.
4. **Verify**: NeverBounce before send (bounce <2% gate).
5. **Research + draft**: S063 deep-research → personalised Touch 0 (auto-skips investor/arbitration leads).
6. **Send**: rotated alias → linted → relay-routed → journey-tracked.

## Compliance guardrails baked in
- Sources are licensed/public; no LinkedIn/Instagram personal-profile scraping.
- PECR: B2B corporate recipients, legitimate-interest basis, unsubscribe in every email (List-Unsubscribe).
- Suppression + STOP honored automatically (S012/IMAP classifier).
- Investor/arbitration-institution leads filtered out of Tamazia outreach (credibility firewall).

## Status
- Ad-runner detection + sourcing + research + send: **BUILT + verified.**
- **Activation step (flagged):** connect **Apollo MCP** (one click in Cowork) so enrichment runs via the licensed API at scale instead of ad-hoc; then the 06:00 sourcing branch (n8n/launchd) runs the full cross-sector loop autonomously. Until Apollo MCP is connected, enrichment uses the existing Apollo REST key (org-level) + Hunter.
- **To go fully autonomous cross-sector:** (1) connect Apollo MCP, (2) activate the launchd/n8n 06:00 branch, (3) confirm sector × geo target list. I can wire all three on your go-ahead.
