# PRECHECK — BUILD STREAM P2 (engine/pipeline)

Branch: `v4-p2-engine` · base HEAD `bdf141c` (GitHub main FETCH_HEAD `bdf141c`).
Phase-0 search-first results. Read-only Neon queried live (SELECT-only).

## 1. The 20x20 matrix — FOUND
- `config/sector-grid.json` · version `v3-2026-06-13` · source "Research Report 1.pdf".
- Dimension 1 = 20 `sectors` (each: code, name, priority_rank, is_priority, regulators[], keywords[], sic_codes[], subsectors[]).
- Dimension 2 = `subsectors[]` per sector (the second axis of the 20x20).
- `priority_top: 10`. The 10 priority sectors (is_priority=true) are:
  LS, HC, AE, DN, FS, RE, HO, FB, ED, PB — **exact match** to the 10 sectors in the drafted touch copy. Used for the governor's 10x10 per-sector fairness.
- `tier_pricing`: Foundation / Authority / Enterprise.

## 2. Country target list — FOUND (prose, not a config file)
- No `countries.json` / no geo field inside sector-grid.json.
- Served geos are encoded as regex in `src/lib/sourcing/icp.js` GEO.tld + GEO.names: UK, UAE, USA, EU (full member list), wider Middle East (Saudi/Qatar/Kuwait/Bahrain/Oman).
- Narrative country list: `docs/TAMAZIA-INTERNATIONAL-REPOSITIONING-BRIEF.md` (UK home market, EU, USA, Middle East; "Top 20 sector × jurisdiction pairs").
- CLAUDE.md confirms served geos = UK + UAE + USA + EU + ME. No change needed for P2; recorded for campaign/footer geo (EU-rep line).

## 3. Live leads schema — QUERIED (Neon, read-only)
- `leads` = **157 columns**, 8,712 rows.
- Relevant existing columns:
  - `entity_type varchar` — EXISTS but **100% NULL** (8712/8712). CH `company_type` is fetched at source but never persisted. P2-1a must wire it.
  - `consent_documented boolean` — EXISTS. `consent_required` does **NOT** exist → P2 adds it (P2 owns this column).
  - `icp_tier smallint`, `quality_fit boolean`, `quality_score int`, `total_score`, `sector_code`, `lifecycle_stage` — all present and populated.
  - `linkedin_url text`, `contact_linkedin text`, `linkedin_confidence numeric` — single-LinkedIn. `decision_makers jsonb` EXISTS (target for P2-3 up-to-3 names).
  - `source varchar` — scraper attribution. Distinct: serp_organic_top100 (8118), osm_overpass (244), companies_house_uk (135), gleif (79), sec_edgar (39), jobspy (37), serp-top (31), maps (6), google_sponsored (2).
- Live tier distribution (scored=8291): Tier1=614 (all fit, all email), Tier2=7491, Tier3=180, null=6. 20 distinct sector_codes. → used to hand-label the eval set.

## 4. Drafted Touch copy — FOUND
- `/Users/amanigga/Desktop/TAMAZIA-REBUILD/Tamazia-Remix/campaigns/touch-copy-top10.md` (DRAFT for founder review).
- Covers Touch 0/1/2 for all 10 priority sectors (LS HC AE DN FS RE HO FB ED PB), with: two asks (soft + meeting), "if you market online, you are regulated", right-person ask, credential line (LLM in International Business Law, King's College London), compliant footer with `[TODO: founder: registered address]` + reply-unsubscribe. Cadence intervals 0,+3,+7,+12,+19,+28,+40. Touches 3-6 noted as drafted separately.
- This is the source copy for P2-5 `/campaigns/`.

## 5. Existing assets to VERIFY (not rebuild)
- `scripts/qualify-and-queue.js` — the qualifier (reads via to_jsonb, calls scoreLead). No entity gate yet.
- `src/lib/enrich/lead-quality.js` — 10-layer + V3 4-component scorer, `scoreLead()` → {tier,fit,total_score,...}. Async (fetches site).
- `src/lib/sourcing/icp.js` — preFilter/scoreICP (pure, deterministic).
- `src/lib/send-pacing.js` — perInboxCap ramp = **[5,10,20,30,40]** (P2-5 must fix to 30/40/45 over three 10-day steps). No Saturday pause, no jitter.
- `src/lib/notify/relay-router.js` — already emits List-Unsubscribe (mailto + RFC8058 one-click when UNSUB_ENDPOINT set) on all 6 providers. (NB: these relays are the FROZEN legacy transactional set; Mystrika is the live send brain.)
- `src/skills/S064-touch-cadence/scripts/render.js` — locked Touch 0-3 renderer (DB-driven, generic; the per-sector compliant copy lives in /campaigns/).
- `src/templates/email/footer.txt` + `footer.html` — canonical footer with {{company_number}} {{ico_number}} registered address {{unsubscribe_url}} {{eu_rep_line}} {{framework_version}}.
- `scraper_scorecard` table — EXISTS (0 rows, no writer). Cols: scraper_source, sampled_at, sample_n, valid_email_pct, named_contact_pct, sector_match_pct, linkedin_id_pct, duplicate_pct, tier1_pct, cost_per_lead, verdict. → P2-4 writes it (no DDL needed; map serper_cost→cost_per_lead, tier_mix→tier1_pct).
- `notifications` table (kind,severity,title,body,realtime,digested_at) — daily-digest.js reads it; red-flag wire = insert a 'lead'/'scorecard' row (policy.js INSERT pattern).
- `.github/workflows/nightly-workers.yml` (02:30 UTC), `eval-audit.yml` (Mon 05:30), `daily-digest.yml`.

## Schema ownership note
P2 OWNS `leads.consent_required` only. P3 owns engine_runs + metrics (untouched).
Additive DDL recorded in canonical-schema.json + .sql; coordinator provisions.
